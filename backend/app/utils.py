import bcrypt
import mysql
import qrcode
import uuid
import os
import smtplib
import re
import logging
from flask import current_app
from email.message import EmailMessage
import phonenumbers
from phonenumbers import  PhoneNumberFormat, region_code_for_country_code
import requests
from .database import get_db_connection

# Stockage OTP temporaire
otp_storage = {}
register_otp_storage = {}

def hash_password(password: str) -> bytes:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt)

def verify_password(plain_password: str, hashed_password: bytes) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password)

def is_valid_password(password: str) -> bool:
    if len(password) < 8:
        return False
    if not re.search(r"[A-Z]", password):
        return False
    if not re.search(r"\d", password):
        return False
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        return False
    return True


def send_otp_email(
    to_email: str,
    otp: str,
    sender_email: str,
    sender_password: str,
    smtp_host: str,
    smtp_port: int = 465,
    use_ssl: bool = True,
):
    msg = EmailMessage()
    msg["Subject"] = "Votre code OTP"
    msg["From"] = sender_email
    msg["To"] = to_email
    msg.set_content(
        f"Bonjour,\n\nVotre code OTP est : {otp}\nIl expire dans 5 minutes.\n\n— Assist-by-Scan"
    )

    current_app.logger.info(
        f"[MAIL] host={smtp_host} port={smtp_port} ssl={use_ssl} user={sender_email}"
    )

    try:
        if use_ssl:
            # Port 465 (SSL direct)
            with smtplib.SMTP_SSL(smtp_host, smtp_port) as server:
                server.login(sender_email, sender_password)
                server.send_message(msg)
        else:
            # Port 587 (STARTTLS)
            with smtplib.SMTP(smtp_host, smtp_port) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(sender_email, sender_password)
                server.send_message(msg)
        current_app.logger.info(f"[MAIL] OTP email sent to {to_email}")
    except Exception:
        import traceback
        current_app.logger.error("[MAIL] Failed to send OTP email:\n" + traceback.format_exc())
        raise


import vonage

def send_otp_sms(client, to_phone_number: str, otp: str, sender_name: str = "OTP"):
    sms = vonage.Sms(client)
    
    response_data = sms.send_message({
        "from": sender_name,  # peut être un numéro ou un nom court (11 caractères max)
        "to": to_phone_number,  # ex: +33612345678
        "text": f"Votre code OTP est : {otp}",
    })

    # Vérifie si l'envoi a réussi
    if response_data["messages"][0]["status"] == "0":
        return f"Message envoyé avec succès (message-id: {response_data['messages'][0]['message-id']})"
    else:
        return f"Erreur: {response_data['messages'][0]['error-text']}"


# def send_otp_sms(client: Client, to_phone_number: str, otp: str, twilio_phone_number: str):
#     message = client.messages.create(
#         body=f"Votre code OTP est : {otp}",
#         from_=twilio_phone_number,
#         to=to_phone_number
#     )
#     return message.sid

def is_email_taken(new_email):
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        query = "SELECT 1 FROM users WHERE email = %s LIMIT 1"
        cursor.execute(query, (new_email,))
        result = cursor.fetchone()
        return result is not None  # True si email existe
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return True  # En cas d'erreur, on considère l'email comme pris par sécurité
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

# 🔍 Recherche l'utilisateur par email ou username
import re

def get_user_by_contact(data, application):
    if isinstance(data, str):
        data = {"contact": data}

    contact = data.get("contact", "").strip()
    if contact == "":
        return None

    email_regex = r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$'
    user = None
    conn = None
    cursor = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        if re.match(email_regex, contact):
            query = """
                SELECT id, username, email 
                FROM users 
                WHERE (email = %s OR username = %s) 
                AND application = %s
                LIMIT 1
            """
            cursor.execute(query, (contact, contact, application))
            row = cursor.fetchone()
            if row:
                user = {
                    'id': row[0],
                    'username': row[1],
                    'email': row[2],
                    'contact_type': 'email'
                }
        else:
            # Décommenter cette partie si tu veux gérer les numéros de téléphone
            # query = """
            #     SELECT id, phone_number 
            #     FROM users 
            #     WHERE phone_number = %s 
            #     AND application = %s
            #     LIMIT 1
            # """
            # cursor.execute(query, (contact, application))
            # row = cursor.fetchone()
            # if row:
            #     user = {
            #         'id': row[0],
            #         'phone_number': row[1],
            #         'contact_type': 'phone'
            #     }
            pass

    except Exception as e:
        print(f"Database error: {e}")
        return {"errors": [{"message": "Database error."}]}
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

    if user:
        return user

    # Recherche dans register_otp_storage si utilisateur temporaire (ex: en cours d'inscription)
    record = register_otp_storage.get(contact)
    if record:
        return {
            'id': None,
            'username': record.get('username'),
            'email': record.get('email'),
            'contact_type': 'email'  # ou 'phone' si tu gères les téléphones
        }

    return None



def generate_qr_code(output_folder, application, index):
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)

    code = str(uuid.uuid4())  # Unique code stored in DB
    filename = f"{application}{index}.png"  # File name: application1.png, application2.png, etc.
    path = os.path.join(output_folder, filename)

    img = qrcode.make(code)
    img.save(path)

    return code, path




def reset_auto_increment(conn, table_name: str):
    cursor = conn.cursor()
    try:
        cursor.execute(f"SELECT MAX(id) FROM {table_name};")
        max_id = cursor.fetchone()[0]
        new_auto_inc = (max_id or 0) + 1
        cursor.execute(f"ALTER TABLE {table_name} AUTO_INCREMENT = {new_auto_inc};")
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        cursor.close()




def format_number_simple(number, country_or_prefix):
    try:
        # Si country_or_prefix est un indicatif international (+33 par exemple)
        if country_or_prefix.startswith('+'):
            # On convertit indicatif en code pays ISO (ex: "+33" -> "FR")
            country_or_prefix = region_code_for_country_code(int(country_or_prefix.lstrip('+')))
            if country_or_prefix is None:
                return "Error: Invalid country calling code"

        # Si le numéro commence par +, on le parse directement (numéro international complet)
        if number.startswith('+'):
            parsed_number = phonenumbers.parse(number, None)
        else:
            # Sinon on parse avec le code pays ISO détecté
            parsed_number = phonenumbers.parse(number, country_or_prefix)

        # Validation du numéro
        if not phonenumbers.is_valid_number(parsed_number):
            return "Invalid phone number"

        # Formatage en E164 (ex: +33612345678)
        return phonenumbers.format_number(parsed_number, PhoneNumberFormat.E164)

    except phonenumbers.NumberParseException as e:
        return f"Error: {str(e)}"
# def hash_qr_code(qr_code_str: str) -> str:
#     salt = bcrypt.gensalt()
#     hashed = bcrypt.hashpw(qr_code_str.encode('utf-8'), salt)
#     return hashed.decode('utf-8')

# def verify_qr_code(qr_code_plain: str, hashed_qr_code: str) -> bool:
#     return bcrypt.checkpw(qr_code_plain.encode('utf-8'), hashed_qr_code.encode('utf-8'))

import re

def validate_email_format(email: str) -> tuple[str, list]:
    email_clean = email.strip()
    email_regex = r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$'
    errors = []

    if email_clean and not re.match(email_regex, email_clean):
        errors.append({'field': 'email', 'message': 'Invalid email format.'})

    return email_clean, errors


FCM_API_KEY = ''

def send_fcm_notification(token, title, body):
    url = "https://fcm.googleapis.com/fcm/send"
    headers = {
        'Authorization': f'key={FCM_API_KEY}',
        'Content-Type': 'application/json'
    }
    payload = {
        "to": token,
        "notification": {
            "title": title,
            "body": body
        }
    }
    response = requests.post(url, headers=headers, json=payload)
    return response.json()
