import bcrypt
import mysql
import qrcode
import uuid
import os
import smtplib
import re
from twilio.rest import Client
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

def send_otp_email(to_email: str, otp: str, sender_email: str, sender_password: str):
    with smtplib.SMTP("smtp.gmail.com", 587) as server:
        server.starttls()
        server.login(sender_email, sender_password)
        message = f"Subject: Votre code OTP\n\nVotre code OTP est : {otp}"
        server.sendmail(sender_email, to_email, message)


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
def get_user_by_contact(data):
    if isinstance(data, str):
        data = {"contact": data}

    contact = data.get("contact", "").strip()
    email_regex = r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$'

    if contact == "":
        return None

    if re.match(email_regex, contact):
        user = None
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            query = "SELECT id, username, email FROM users WHERE email = %s OR username = %s"
            cursor.execute(query, (contact, contact))
            row = cursor.fetchone()
            if row:
                user = {
                    'id': row[0],
                    'username': row[1],
                    'email': row[2],
                    'contact_type': 'email'   # ajouté ici
                }
        except Exception as e:
            print(f"Database error: {e}")
            return {"errors": [{"message": "Database error."}]}
        finally:
            cursor.close()
            conn.close()

        if user:
            return user

        record = register_otp_storage.get(contact)
        if record:
            return {
                'id': None,
                'username': record['username'],
                'email': record['email'],
                'contact_type': 'email'
            }

    else:
        user = None
        phone_number = contact
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            query = "SELECT id, phone_number FROM users WHERE phone_number = %s"
            cursor.execute(query, (phone_number,))
            row = cursor.fetchone()
            if row:
                user = {
                    'id': row[0],
                    'phone_number': row[1],
                    'contact_type': 'phone'   # ajouté ici
                }
        except Exception as e:
            print(f"Database error: {e}")
            return {"errors": [{"message": "Database error."}]}
        finally:
            cursor.close()
            conn.close()

        if user:
            return user

    return None




def generate_qr_code(output_folder):
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)

    code = str(uuid.uuid4())  # UUID unique
    img = qrcode.make(code)
    path = os.path.join(output_folder, f"{code}.png")
    img.save(path)
    return code, path

# def hash_qr_code(qr_code_str: str) -> str:
#     salt = bcrypt.gensalt()
#     hashed = bcrypt.hashpw(qr_code_str.encode('utf-8'), salt)
#     return hashed.decode('utf-8')

# def verify_qr_code(qr_code_plain: str, hashed_qr_code: str) -> bool:
#     return bcrypt.checkpw(qr_code_plain.encode('utf-8'), hashed_qr_code.encode('utf-8'))
