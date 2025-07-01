import logging
import smtplib
import mysql.connector
import os
import random
import re
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify, current_app
from twilio.rest import Client

from .utils import (
    generate_qr_code,
    register_otp_storage,
    otp_storage,
    get_user_by_contact,
    hash_password,
    is_email_taken,
    send_otp_sms,
    verify_password,
    is_valid_password,
    send_otp_email,
)
from .database import get_db_connection

bp = Blueprint('main', __name__, url_prefix="/api")


@bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data:
        return jsonify({'status': 'error', 'message': "No data received."}), 400
    
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({'status': 'error', 'message': 'Username or email and password required.'}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE username=%s OR email=%s", (username, username))
        users = cursor.fetchone()
    except Exception as err:
        return jsonify({'status': 'error', 'message': f'Database error: {str(err)}'}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

    if not users:
        return jsonify({'status': 'error', 'message': "Incorrect username or password."}), 404

    try:
        hashed_password = users[2]
        if isinstance(hashed_password, str):
            hashed_password = hashed_password.encode('utf-8')

        if verify_password(password, hashed_password):
            role = users[7]
            user = users[1]
            email = users[3]
            return jsonify({'status': 'success', 'message': "Login successful!", 'role': role, 'user': user, 'email': email}), 200
        else:
            return jsonify({'status': 'error', 'message': "Incorrect username or password."}), 401
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'Processing error: {str(e)}'}), 500

@bp.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    if not data:
        return jsonify({'status': 'error', 'message': 'No data received.'}), 400

    required_fields = ["username", "email", "password", "confirm_password", "number", "address", "country_code", "city", "postal_code"]
    errors = []

    for field in required_fields:
        if not data.get(field):
            errors.append({'field': field, 'message': f"The field '{field.replace('_', ' ').capitalize()}' is required."})

    email = data.get("email", "").strip()
    email_regex = r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$'
    if email and not re.match(email_regex, email):
        errors.append({'field': 'email', 'message': 'Invalid email format.'})

    password = data.get("password", "").strip()
    confirm_password = data.get("confirm_password", "").strip()
    if not is_valid_password(password):
        errors.append({'field': 'password', 'message': "Password must be at least 8 characters long, include an uppercase letter, a number, and a special character."})
    elif password != confirm_password:
        errors.append({'field': 'confirm_password', 'message': "Passwords do not match."})

    if errors:
        return jsonify({'status': 'error', 'message': 'Validation errors.', 'errors': errors}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM users WHERE username = %s OR email = %s", (data["username"], data["email"]))
        if cursor.fetchone():
            return jsonify({'status': 'error', 'message': "Username or email already exists."}), 400

        cursor.execute("SELECT * FROM registred_users WHERE username = %s OR email = %s", (data["username"], data["email"]))
        user_registred = cursor.fetchone()
        if not user_registred:
            return jsonify({'status': 'error', 'message': "Username or email can't be used."}), 400
        role = user_registred[3]

        otp = str(random.randint(1000, 9999))
        expires_at = datetime.utcnow() + timedelta(minutes=5)
        password_hash = hash_password(password)
        if isinstance(password_hash, bytes):
            password_hash = password_hash.decode('utf-8')

        register_otp_storage[email] = {
            'username': data['username'],
            'email': email,
            'password_hash': password_hash,
            'number': data['number'],
            'address': data['address'],
            'postal_code': data['postal_code'],
            'city': data['city'],
            'country_code': data['country_code'],
            'role': role,
            'otp': otp,
            'expires_at': expires_at,
            'attempts': 0
        }

        otp_storage[email] = {
            'otp': otp,
            'expires_at': expires_at,
            'attempts': 0
        }

        send_otp_email(email, otp, current_app.config['EMAIL_SENDER'], current_app.config['EMAIL_PASSWORD'])

        return jsonify({"message": "OTP sent to your email."}), 200

    except Exception as e:
        return jsonify({'status': 'error', 'message': f"Server error: {str(e)}"}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

@bp.route('/verify_register', methods=['POST'])
def verify_register():
    data = request.get_json()
    otp = data.get('otp')
    email = data.get('email')
    if not otp or not email:
        return jsonify({'status': 'error', 'message': 'OTP and email are required.'}), 400

    record = register_otp_storage.get(email)
    if not record:
        return jsonify({'status': 'error', 'message': 'No OTP found for this email.'}), 404
    
    MAX_ATTEMPTS = 5
    if record['attempts'] >= MAX_ATTEMPTS:
        del register_otp_storage[email]
        return jsonify({'status': 'error', 'message': 'Too many attempts. OTP blocked.'}), 429

    if datetime.utcnow() > record['expires_at']:
        del register_otp_storage[email]
        return jsonify({'status': 'error', 'message': 'OTP expired.'}), 400

    if record['otp'] != otp:
        record['attempts'] += 1
        return jsonify({'status': 'error', 'message': 'Incorrect OTP.'}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            INSERT INTO users 
                (username, email, password_hash, phone_number, address, role, ville, code_postal, indicatif_telephonique)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            record['username'],
            record['email'],
            record['password_hash'],
            record['number'],
            record['address'],
            record['role'],
            record['city'],
            record['postal_code'],
            record['country_code']
        ))
        conn.commit()

        del register_otp_storage[email]

        return jsonify({'status': 'success', 'message': 'User successfully verified and registered.'}), 200

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

@bp.route('/forgot_password', methods=['POST'])
def forgot_password():
    data = request.get_json()
    contact = data.get('email')  # ici, c'est le contact (email ou téléphone) envoyé par le client

    if not contact:
        return jsonify({'status': 'error', 'message': "Email or phone is required."}), 400

    user, contact_type = get_user_by_contact(contact)

    if not user:
        return jsonify({'status': 'error', 'message': "User not found."}), 404

    # On récupère l'email si c'est un email, sinon téléphone
    if contact_type == 'email':
        user_contact = user.get('email')
    elif contact_type == 'phone':
        user_contact = user.get('phone_number')
    else:
        return jsonify({'status': 'error', 'message': "Invalid contact type."}), 400

    if not user_contact:
        return jsonify({'status': 'error', 'message': "Email or phone number required."}), 400

    otp = str(random.randint(1000, 9999))
    expires_at = datetime.utcnow() + timedelta(minutes=5)

    # Stocker OTP avec la clé correspondant au contact utilisé (email ou téléphone)
    otp_storage[user_contact] = {'otp': otp, 'expires_at': expires_at, 'attempts': 0}

    try:
        if contact_type == 'email':
            send_otp_email(user_contact, otp)
            message = "OTP sent to your email."
        else:
            send_otp_sms(user_contact, otp)
            message = "OTP sent to your phone."

        return jsonify({'status': 'success', 'message': message})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500




@bp.route('/verify_forget', methods=['POST'])
def verify_forget():
    data = request.get_json()
    otp = data.get('otp')
    email = data.get('email')
    user = get_user_by_contact(email)
    if not user:
        return jsonify({'status': 'error', 'message': "User not found."}), 404
    email = user['email']
    print(f"email: {email}")  # DEBUG: Afficher l'email reçu
    if not otp or not email:
        return jsonify({'status': 'error', 'message': "OTP and email/username are required."}), 400

    record = otp_storage.get(user["email"])
    if not record:
        return jsonify({'status': 'error', 'message': "No OTP found for this user."}), 404

    # Limite des tentatives fixée à 5 par exemple
    MAX_ATTEMPTS = 5
    if record['attempts'] >= MAX_ATTEMPTS:
        del otp_storage[email]  # suppression pour bloquer définitivement ou temporairement
        return jsonify({'status': 'error', 'message': 'Too many attempts. OTP blocked.'}), 429

    if datetime.utcnow() > record['expires_at']:
        del otp_storage[email]
        return jsonify({'status': 'error', 'message': "OTP expired."}), 400

    if record['otp'] != otp:
        record['attempts'] += 1  # <-- Incrémenter ici
        return jsonify({'status': 'error', 'message': "Incorrect OTP."}), 400


    del otp_storage[email]
    return jsonify({'status': 'success', 'message': "User successfully verified."}), 200


@bp.route('/resend_otp', methods=['POST'])
def resend_otp():
    data = request.get_json()
    email = data.get('email')
    previous_page = data.get('previous_page')

    if not email:
        return jsonify({'status': 'error', 'message': "Email is required."}), 400

    user = get_user_by_contact(email)

    new_otp = str(random.randint(1000, 9999))
    expires_at = datetime.utcnow() + timedelta(minutes=5)

    if user:
        if previous_page == "SignUpActivity":
            # Mise à jour register_otp_storage
            record = register_otp_storage.get(email)
            if not record:
                return jsonify({'status': 'error', 'message': "User not found in registration storage."}), 404
            record['otp'] = new_otp
            record['expires_at'] = expires_at
            record['attempts'] = 0
            print(f"[DEBUG] OTP updated in register_otp_storage for {email}: {register_otp_storage[email]}")
        else:
            # Mise à jour otp_storage
            old_record = otp_storage.get(email, {})
            otp_storage[user["email"]] = {
                'otp': new_otp,
                'expires_at': expires_at,
                'attempts': 0,
                'new_email': old_record.get('new_email')
            }
            print(f"[DEBUG] OTP updated in otp_storage for {user['email']}: {otp_storage[user['email']]}")

    try:
        send_otp_email(user['email'], new_otp)
        print(f"[INFO] New OTP sent to {email}: {new_otp}")
        return jsonify({'status': 'success', 'message': "New OTP sent to your email."}), 200
    except Exception as e:
        print("Error sending OTP:", str(e))
        return jsonify({'status': 'error', 'message': f"Server error: {str(e)}"}), 500

# Endpoint pour enregistrer la réponse
@bp.route('/save_response', methods=['POST'])
def save_response():
    try:
        data = request.get_json()
        print("Received data:", data)  # DEBUG: Afficher les données reçues

        question_id = data.get('question_id')
        response_text = data.get('response')
        username = data.get('username')
        qr_code = data.get('qr_code')

        if not question_id or not response_text or not username or not qr_code:
            return jsonify({'status': 'error', 'message': "Missing data."}), 400

        conn = get_db_connection()
        cursor = conn.cursor()

        # DEBUG : Afficher la requête et les valeurs
        print(f"Inserting: {question_id}, {response_text}, {username}, {qr_code}")

        cursor.execute(
            "INSERT INTO responses (question_id, response, username, qr_code) VALUES (%s, %s, %s, %s)",
            (question_id, response_text, username, qr_code)
        )
        conn.commit()

        cursor.close()
        conn.close()

        return jsonify({'status': 'success', 'message': "Response saved."}), 200

    except Exception as e:
        print("Error:", e)  # Affiche l'erreur complète dans la console
        return jsonify({'status': 'error', 'message': f'Erreur : {str(e)}'}), 500

    
@bp.route('/send_ask', methods=['POST'])
def send_ask():
    try:
        data = request.get_json()
        print("Received data in send_ask:", data)

        username = data.get('username')
        date_str = data.get('date')  # format attendu: "Tuesday, 03 June 16:50"
        comment = data.get('comment')
        qr_code = data.get('qr_code')

        if not username or not date_str or not comment or not qr_code:
            return jsonify({'status': 'error', 'message': 'Missing data'}), 400

        try:
            # Extrait la partie utile
            parts = date_str.split(', ')
            if len(parts) != 2:
                raise ValueError("Expected format: 'DayName, dd MMMM HH:mm'")

            date_time_str = parts[1]  # '03 June 16:50'
            current_year = datetime.now().year
            full_datetime_str = f"{date_time_str} {current_year}"  # '03 June 16:50 2025'

            appointment_datetime = datetime.strptime(full_datetime_str, "%d %B %H:%M %Y")

        except Exception as parse_err:
            print("Error parsing date:", parse_err)
            return jsonify({'status': 'error', 'message': 'Invalid date format. Expected: dd MMMM HH:mm'}), 400

        # Séparer date et heure
        date_only = appointment_datetime.date()     # 2025-06-03
        time_only = appointment_datetime.time()     # 16:50:00

        print(f"Inserting into ask_repair: username={username}, date={date_only}, hour_slot={time_only}, comment={comment}, qr_code={qr_code}")

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO ask_repair (username, date, hour_slot, comment, qr_code) VALUES (%s, %s, %s, %s, %s)",
            (username, date_only, time_only, comment, qr_code)
        )
        conn.commit()
        cursor.close()
        conn.close()

        return jsonify({'status': 'success', 'message': 'Ask repair saved'}), 200

    except Exception as e:
        print("Error in send_ask:", e)
        return jsonify({'status': 'error', 'message': f'Erreur : {str(e)}'}), 500
    

@bp.route('/change-password', methods=['POST'])
def change_password_forget():
    data = request.json
    email = data.get('email')
    new_password = data.get('new_password')
    confirm_password = data.get('confirm_password')

    if not email or not new_password or not confirm_password:
        return jsonify({'status': 'error', 'message': 'All fields are required.'}), 400
    
    if new_password != confirm_password:
        return jsonify({'status': 'error', 'message': 'Passwords do not match.'}), 400
    
    if not is_valid_password(new_password):
        return jsonify({
            'status': 'error', 'message': 'Password must be at least 8 characters, include an uppercase letter, a number, and a special character.'
        }), 400

    hashed_password = hash_password(new_password)

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE email = %s OR username = %s", (email, email))
        user = cursor.fetchone()

        if user:
            cursor.execute("""
                UPDATE users SET password_hash = %s WHERE email = %s OR username = %s
            """, (hashed_password, email, email))
            conn.commit()
            return jsonify({'message': 'Password updated successfully!'}), 200
        else:
            return jsonify({'status': 'error', 'message': 'Email not found.'}), 404

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

    finally:
        cursor.close()
        conn.close()


@bp.route('/change_username', methods=['POST'])
def change_username():
    data = request.get_json()
    if not data:
        return jsonify({'status': 'error', 'message': 'No data received.'}), 400
    new_username = data.get('new_username')
    username = data.get('username')
    password = data.get('password')
    if not username or not password or not new_username:
        return jsonify({'status': 'error', 'message': 'All champs requis'}), 400
    try:
        # Connexion à la base de données MySQL
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE username=%s ", (username,))
        user = cursor.fetchone()
    except mysql.connector.Error as err:
        return jsonify({'status': 'error', 'message': f'Database error:{str(err)}'}), 500
    finally:
        if conn:
            cursor.close()
            conn.close()

    if not user:
        return jsonify({'status': 'error', 'message': "User not found or incorrect password."}), 404
    # Récupération du mot de passe haché
    try:
        hashed_password = user[2].encode('utf-8') if isinstance(user[2], str) else user[2]
        if verify_password(password, hashed_password):
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE users SET username = %s WHERE username = %s
            """, (new_username, username))
            conn.commit()
            return jsonify({'status': 'success', 'message': 'Username changed!'}), 200
        else:
            return jsonify({'status': 'error', 'message': "User not found or incorrect password."}), 300
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'Processing error.: {str(e)}'}), 500


@bp.route('/change_email', methods=['POST'])
def change_email():
    data = request.get_json()
    print("Payload reçu:", data)  # Pour debug

    if not data:
        return jsonify({'status': 'error', 'message': 'No data received.'}), 400
    
    new_email = data.get('new_email')
    email = data.get('email')
    password = data.get('password')

    if not email or not password or not new_email:
        return jsonify({'status': 'error', 'message': 'All fields are required.'}), 400

    email_regex = r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$'
    if not re.match(email_regex, email) or not re.match(email_regex, new_email):
        return jsonify({'status': 'error', 'message': 'The email format is invalid.'}), 400

    if email == new_email:
        return jsonify({'status': 'error', 'message': "New email cannot be the same as current email."}), 400

    if is_email_taken(new_email):
        return jsonify({'status': 'error', 'message': 'This email is already in use.'}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT password_hash FROM users WHERE email = %s", (email,))
        user = cursor.fetchone()
        if not user:
            return jsonify({'status': 'error', 'message': 'User not found.'}), 404

        hashed_password = user[0]
        hashed_password = hashed_password.encode('utf-8') if isinstance(hashed_password, str) else hashed_password

        if not verify_password(password, hashed_password):
            return jsonify({'status': 'error', 'message': 'Incorrect password.'}), 401

        otp = str(random.randint(1000, 9999))
        expires_at = datetime.utcnow() + timedelta(minutes=5)

        # Stockage sécurisé côté serveur du OTP + new_email + expiration + tentative
        otp_storage[email] = {
            'otp': otp,
            'new_email': new_email,
            'expires_at': expires_at,
            'attempts': 0
        }

        send_otp_email(new_email, otp)

        return jsonify({'status': 'success', 'message': 'OTP sent to new email.'}), 200

    except mysql.connector.Error as err:
        print(f"Erreur base de données : {err}")
        return jsonify({'status': 'error', 'message': f'Database error: {err}'}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@bp.route('/verify_change_email', methods=['POST'])
def verify_change_email():
    data = request.get_json()
    otp = data.get('otp')
    email = data.get('email')
    MAX_ATTEMPTS = 5
    conn = None
    cursor = None

    if not email or not otp:
        return jsonify({'status': 'error', 'message': 'Missing fields.'}), 400

    record = otp_storage.get(email)
    if not record:
        return jsonify({'status': 'error', 'message': 'No OTP found for this user.'}), 404


    if record['attempts'] >= MAX_ATTEMPTS:
        del otp_storage[email]
        return jsonify({'status': 'error', 'message': 'Too many attempts. OTP blocked.'}), 429

    if datetime.utcnow() > record['expires_at']:
        del otp_storage[email]
        return jsonify({'status': 'error', 'message': 'OTP expired.'}), 400

    if record['otp'] != otp:
        record['attempts'] += 1
        return jsonify({'status': 'error', 'message': 'Incorrect OTP.'}), 400


    try:
        new_email = record['new_email']
        print(f"Changing email from {email} to {new_email}")

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET email = %s WHERE email = %s", (new_email, email))
        conn.commit()

        del otp_storage[email]

        return jsonify({'status': 'success', 'message': 'Email changed successfully.'}), 200

    except mysql.connector.Error as err:
        return jsonify({'status': 'error', 'message': f'Database error: {err}'}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@bp.route('/change_number', methods=['POST'])
def change_number():
    data = request.get_json()
    if not data:
        return jsonify({'status': 'error', 'message': 'No data received.'}), 400
    new_phone = data.get('new_phone')
    phone = data.get('phone')
    code = data.get('code')
    new_code = data.get('new_code')
    password = data.get('password')
    if not phone or not password or not new_phone or not code or not new_code:
        return jsonify({'status': 'error', 'message': 'All champs requis'}), 400
    try:
        # Connexion à la base de données MySQL
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE phone_number=%s AND indicatif_telephonique=%s ", (phone, code))
        user = cursor.fetchone()
    except mysql.connector.Error as err:
        return jsonify({'status': 'error', 'message': f'Database error:{str(err)}'}), 500
    finally:
        if conn:
            cursor.close()
            conn.close()

    if not user:
        return jsonify({'status': 'error', 'message': "User not found or incorrect password."}), 404
    # Récupération du mot de passe haché
    try:
        hashed_password = user[2].encode('utf-8') if isinstance(user[2], str) else user[2]
        if verify_password(password, hashed_password):
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("""
            UPDATE users 
            SET phone_number = %s, indicatif_telephonique = %s 
            WHERE phone_number = %s AND indicatif_telephonique = %s;

            """, (new_phone, new_code, phone, code))
            conn.commit()
            return jsonify({'status': 'success', 'message': 'number changed!'}), 200
        else:
            return jsonify({'status': 'error', 'message': "User not found or incorrect password."}), 401
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'Processing error.: {str(e)}'}), 500


@bp.route('/change_password', methods=['POST'])
def change_password():
    """
    Endpoint pour changer le mot de passe d'un utilisateur.
    """
    data = request.get_json()
    if not data:
        return jsonify({'status': 'error', 'message': 'No data received.'}), 400

    # Extraction des champs
    email = data.get('email')
    password = data.get('password')
    new_password = data.get('new_password')
    confirm_new_password = data.get('confirm_new_password')

    # Validation des champs
    if not email or not password or not new_password:
        return jsonify({'status': 'error', 'message': "All fields are required."}), 400
    # Email format validation
    email = data.get("email", "").strip()
    email_regex = r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$'
    # if email and not re.match(email_regex, email):
    #     return jsonify({
    #         'status': 'error',
    #         'message': 'Invalid email format.'
    #     }), 400 
    if confirm_new_password != new_password:
       return jsonify({
            'status': 'error',
            'message': "Passwords do not match."
        }), 400 
    if not is_valid_password(new_password):
        return jsonify({
            'status': 'error',
            'message': "The password must be at least 8 characters long and include an uppercase letter, a number, and a special character."
        }), 400

    # Hachage du mot de passe avant de le stocker
    hashed_new_password = hash_password(new_password)
    # Mise à jour de la base de données MySQL
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE email = %s OR username = %s ", (email,email))
        user = cursor.fetchone()
        if not user:
            return jsonify({'status': 'error', 'message': "Incorrect username or password."}), 404
        try:
            hashed_password = user[2].encode('utf-8') if isinstance(user[2], str) else user[2]
            if verify_password(password, hashed_password):
                # Mise à jour du mot de passe dans la base de données
                cursor.execute("""
                    UPDATE users SET password_hash = %s WHERE email = %s OR username = %s
                """, (hashed_new_password, email, email))
                conn.commit()
                return jsonify({'message': 'Password updated successfully!'}), 200
            else:
                return jsonify({'status': 'error', 'message': "Incorrect username or password."}), 401
        except Exception as e:
            return jsonify({'status': 'error', 'message': f'Processing error: {str(e)}'}), 500
    except mysql.connector.Error as err:
        return jsonify({'status': 'error', 'message': f'Database error: {str(err)}'}), 500

    except Exception as e:
        return jsonify({'status': 'error', 'message': f'Unexpected error. : {str(e)}'}), 500

    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


@bp.route('/delete_account', methods=['POST'])
def delete_account():
    data = request.get_json()

    if not data:
        return jsonify({'status': 'error', 'message': 'No data received.'}), 400

    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({'status': 'error', 'message': 'Email and password are required.'}), 400

    # Vérification format email
    email_regex = r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$'
    if not re.match(email_regex, email):
        return jsonify({'status': 'error', 'message': 'Invalid email format.'}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE email=%s", (email,))
        user = cursor.fetchone()

        if not user:
            return jsonify({'status': 'error', 'message': "User not found."}), 404

        hashed_password = user[2]  # Assurez-vous que c'est bien le champ du mot de passe
        if isinstance(hashed_password, str):
            hashed_password = hashed_password.encode('utf-8')

        if not verify_password(password, hashed_password):
            return jsonify({'status': 'error', 'message': "Incorrect password."}), 401

        # Génération OTP
        otp = str(random.randint(1000, 9999))
        expires_at = datetime.utcnow() + timedelta(minutes=5)
        otp_storage[email] = {
            "email": email,
            "otp": otp,
            "expires_at": expires_at,
            "attempts": 0
        }

        send_otp_email(email, otp)
        return jsonify({"status": "success", "message": "OTP sent to your email.", "email": email}), 200

    except mysql.connector.Error as err:
        return jsonify({'status': 'error', 'message': f'Database error: {str(err)}'}), 500
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'Error: {str(e)}'}), 500
    finally:
        if conn:
            cursor.close()
            conn.close()


@bp.route('/verify_delete_account', methods=['POST'])
def verify_delete_account():
    data = request.get_json()
    otp = data.get('otp')
    email = data.get('email')

    if not data or not otp or not email:
        return jsonify({'status': 'error', 'message': 'OTP and email are required.'}), 400

    record = otp_storage.get(email)
    MAX_ATTEMPTS = 5

    if not record:
        return jsonify({'status': 'error', 'message': 'No OTP found for this user.'}), 404

    if record['attempts'] >= MAX_ATTEMPTS:
        del otp_storage[email]
        return jsonify({'status': 'error', 'message': 'Too many attempts. OTP blocked.'}), 429

    if datetime.utcnow() > record['expires_at']:
        del otp_storage[email]
        return jsonify({'status': 'error', 'message': 'OTP expired.'}), 400

    if record['otp'] != otp:
        record['attempts'] += 1
        return jsonify({'status': 'error', 'message': 'Incorrect OTP.'}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM users WHERE email=%s", (email,))
        user = cursor.fetchone()

        if not user:
            return jsonify({'status': 'error', 'message': "User not found."}), 404

        cursor.execute("DELETE FROM users WHERE email=%s", (email,))
        conn.commit()
        del otp_storage[email]

        return jsonify({'status': 'success', 'message': 'Account successfully deleted.'}), 200

    except mysql.connector.Error as err:
        return jsonify({'status': 'error', 'message': f'Database error: {str(err)}'}), 500
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'Error: {str(e)}'}), 500
    finally:
        if conn:
            cursor.close()
            conn.close()


@bp.route('/add_qr', methods=['POST'])
def add_qr():
    data = request.json
    username = data.get('username')
    location = data.get('location')
    qr_code = data.get('qr_code')

    if not username or not location or not qr_code:
        return jsonify({'status': 'error', 'message': 'All fields are required'}), 400

    try:
        # Connexion à la base de données MySQL
        conn = get_db_connection()
        cursor = conn.cursor()

        # Insertion avec is_active = TRUE
        cursor.execute("""
            UPDATE qr_codes
            SET user = %s, locations = %s, is_active = TRUE
            WHERE qr_code = %s
        """, (username, location, qr_code))

        conn.commit()
        return jsonify({'status': 'success', "message": "QR code successfully added and activated."}), 200

    except mysql.connector.Error as err:
        return jsonify({'status': 'error', 'message': f'Database error: {str(err)}'}), 500

    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()


@bp.route('/exist_qr', methods=['POST'])
def exist_qr():
    data = request.get_json()
    if not data:
        return jsonify({'status': 'error', 'message': "No data received."}), 400

    qr_code = data.get('qr_code')
    if not qr_code:
        return jsonify({'status': 'error', 'message': 'QR code is required.'}), 400

    try:
        # Connexion à la base de données MySQL
        conn = get_db_connection()
        cursor = conn.cursor()

        # Vérifie si le QR code existe
        cursor.execute("SELECT is_active FROM qr_codes WHERE qr_code = %s", (qr_code,))
        result = cursor.fetchone()

        if result:
            is_active = result[0]
            if is_active == True:
                return jsonify({'status': 'success', 'message': 'QR code is active', 'is_active': True}), 200
            else:
                return jsonify({'status': 'success', 'message': 'QR code is not active', 'is_active': False}), 200
        else:
            # Insertion du QR code si inexistant
            # cursor.execute("INSERT INTO qr_codes (qr_code) VALUES (%s)", (qr_code,))
            # conn.commit()
            # QR code non trouvé
            return jsonify({'status': 'success', 'message': 'QR code does not exist'}), 404

    except mysql.connector.Error as err:
        return jsonify({'status': 'error', 'message': f'Database error: {str(err)}'}), 500

    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()




from datetime import datetime
@bp.route('/ask_repair', methods=['GET'])
def ask_repair():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT id, username, date, comment, qr_code, hour_slot, status FROM ask_repair")
        asks = cursor.fetchall()

        asks_list = [{
            'id': row[0],
            'username': row[1],
            'date': row[2].strftime("%A, %d %b %Y") if row[2] else None,
            'comment': row[3],
            'qr_code': row[4],
            'hour_slot': (
                f"{row[5].seconds // 3600:02}:{(row[5].seconds % 3600) // 60:02}:{row[5].seconds % 60:02}"
                if row[5] else None
            ),
            'status': row[6]
        } for row in asks]

        return jsonify(asks_list), 200

    except mysql.connector.Error as err:
        return jsonify({'status': 'error', 'message': f'Database error: {str(err)}'}), 500

    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@bp.route('/send_email', methods=['POST'])
def send_email():
    try:
        data = request.get_json(force=True)
        logging.info(f"Received data from client: {data}")

        to_email = data.get('to_email')
        message_text = data.get('message')

        if not to_email or not message_text:
            return jsonify({"error": "Missing 'to_email' or 'message' parameter"}), 400

        sender_email = "hseinghannoum@gmail.com"
        sender_password = "ehybppmrmbueakgo"  # Attention : stocker en variables d’environnement en prod

        # Compose email message
        email_subject = "Votre demande de maintenance"
        email_body = f"Subject: {email_subject}\n\nVotre code OTP est : {message_text}"

        # Connexion SMTP et envoi de l'email
        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls()
            server.login(sender_email, sender_password)
            server.sendmail(sender_email, to_email, email_body)

        logging.info(f"Email sent successfully to {to_email}")
        return jsonify({"status": "success", "message": f"Email envoyé à {to_email}"}), 200

    except smtplib.SMTPException as smtp_err:
        logging.error(f"SMTP error: {smtp_err}")
        return jsonify({"error": "Erreur lors de l’envoi de l’email"}), 500
    except Exception as e:
        logging.error(f"Unexpected error: {e}")
        return jsonify({"error": "Erreur interne du serveur"}), 500


@bp.route('/taken_slots', methods=['GET'])  # Tu fais un GET maintenant
def get_taken_slots():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT date, hour_slot FROM ask_repair 
            WHERE status IN ('processing', 'repaired')
        """)

        rows = cursor.fetchall()
        taken_slots = {}

        for date, hour in rows:
            date_str = date.strftime("%Y-%m-%d")
            
            # Conversion timedelta (heure) vers HH:MM
            total_seconds = hour.total_seconds()
            hours = int(total_seconds // 3600)
            minutes = int((total_seconds % 3600) // 60)
            hour_str = f"{hours:02}:{minutes:02}"

            if date_str not in taken_slots:
                taken_slots[date_str] = []
            taken_slots[date_str].append(hour_str)

        return jsonify({'status': 'success', 'taken_slots': taken_slots}), 200

    except mysql.connector.Error as err:
        return jsonify({'status': 'error', 'message': f'Database error: {str(err)}'}), 500

    finally:
        if conn:
            cursor.close()
            conn.close()








@bp.route("/generate_qr", methods=["POST"])
def generate_qr():
    data = request.get_json()
    count = int(data.get("count", 1))
    qr_list = []

    conn = get_db_connection()
    cursor = conn.cursor()

    output_folder = os.path.join(current_app.root_path, "static", "qr")

    generated = 0
    while generated < count:
        code, path = generate_qr_code(output_folder)
        try:
            cursor.execute("""
                INSERT INTO qr_codes (qr_code, is_active)
                VALUES (%s, %s)
            """, (code, 0))
            conn.commit()

            qr_list.append({
                "code": code,
                "image_path": f"/static/qr/{os.path.basename(path)}"
            })
            generated += 1

        except mysql.connector.IntegrityError as e:
            if e.errno == 1062:  # Duplicate entry
                # Code déjà existant, on génère un autre sans planter
                continue
            else:
                cursor.close()
                conn.close()
                return jsonify({"error": f"Database error: {e}"}), 500

    cursor.close()
    conn.close()

    return jsonify(qr_list), 201


@bp.route("/questions", methods=["POST"])
def add_question():
    data = request.get_json()
    text = data.get("text", "")

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("INSERT INTO questions (text) VALUES (%s)", (text,))
    conn.commit()

    question_id = cursor.lastrowid

    cursor.close()
    conn.close()

    return jsonify({"message": "Question ajoutée", "id": question_id}), 201

@bp.route('/questions', methods=['GET'])
def get_questions():
    try:
        # Connexion à la base de données MySQL
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM questions")
        questions = cursor.fetchall()

        # Créer une liste de dictionnaires pour retourner les questions et leurs IDs
        questions_list = [{'id': row[0],'text': row[1]} for row in questions]

        return jsonify(questions_list)  # Retourne les questions sous forme de liste de dictionnaires

    except mysql.connector.Error as err:
        return jsonify({'status': 'error', 'message': f'Database error:{str(err)}'}), 500
    finally:
        if conn:
            cursor.close()
            conn.close()

@bp.route('/delete_question/<int:question_id>', methods=['DELETE'])
def delete_question(question_id):
    try:
        # Connexion à la base de données MySQL
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM questions WHERE id = %s", (question_id,))
        conn.commit()

        return jsonify({"status": "success", "message": "Question successfully deleted"}), 200

    except mysql.connector.Error as err:
        return jsonify({'status': 'error', 'message': f'Database error: {str(err)}'}), 500
    finally:
        if conn:
            cursor.close()
            conn.close()

@bp.route('/update_question/<int:question_id>', methods=['PUT'])
def update_question(question_id):
    data = request.get_json()
    new_text = data.get('text', '').strip()
    if not new_text:
        return jsonify({'status': 'error', 'message': 'Le texte ne peut pas être vide.'}), 400
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE questions SET text = %s WHERE id = %s", (new_text, question_id))
        conn.commit()
        return jsonify({"status": "success", "message": "Question modifiée avec succès."}), 200
    except mysql.connector.Error as err:
        return jsonify({'status': 'error', 'message': str(err)}), 500
    finally:
        cursor.close()
        conn.close()
