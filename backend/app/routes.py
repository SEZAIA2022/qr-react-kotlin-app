import hashlib
import logging
import smtplib
import string
import mysql.connector
import os
import random
import re
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify, current_app
from twilio.rest import Client
from .utils import (
    format_number_simple,
    generate_qr_code,
    register_otp_storage,
    otp_storage,
    get_user_by_contact,
    hash_password,
    is_email_taken,
    reset_auto_increment,
    send_otp_sms,
    validate_email_format,
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
    application = data.get('application_name')
    if not username or not password:
        return jsonify({'status': 'error', 'message': 'Username or email and password required.'}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE (username = %s OR email = %s) AND application = %s", (username, username, application))
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

    required_fields = ["username", "email", "password", "confirm_password", "number", "address", "country_code", "city", "postal_code", "application_name"]
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

        cursor.execute("SELECT * FROM users WHERE (username = %s OR email = %s) AND application = %s", (data["username"], data["email"], data.get("application_name")))
        if cursor.fetchone():
            return jsonify({'status': 'error', 'message': "Username or email already exists."}), 400

        cursor.execute("SELECT * FROM registred_users WHERE (username = %s OR email = %s) AND application = %s", (data["username"], data["email"], data.get("application_name")))
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
            'application': data["application_name"],
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
        return jsonify({'status': 'error', 'message': 'Please enter the complete code'}), 400

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
                (username, email, password_hash, phone_number, address, role, city, code_postal, application)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            record['username'],
            record['email'],
            record['password_hash'],
            format_number_simple(record['number'], record['country_code']),
            record['address'],
            record['role'],
            record['city'],
            record['postal_code'],
            record['application']

        ))
        conn.commit()

        del register_otp_storage[email]

        return jsonify({'status': 'success', 'message': 'User successfully verified and registered.'}), 200

    except Exception as e:
        print(str(e))
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


# import vonage
# client = vonage.Client(key="VOTRE_API_KEY", secret="VOTRE_API_SECRET")

@bp.route('/forgot_password', methods=['POST'])
def forgot_password():
    data = request.get_json()
    if not data:
        return jsonify({'status': 'error', 'message': "No data received."}), 400

    contact = data.get('email')  # contact peut être email ou téléphone
    application = data.get("application_name")
    if not contact:
        return jsonify({'status': 'error', 'message': "Email or phone is required."}), 400
    if not application:
        return jsonify({'status': 'error', 'message': "Application name is required."}), 400

    user = get_user_by_contact(contact, application)
    if not user:
        return jsonify({'status': 'error', 'message': "User not found."}), 404

    contact_type = user.get("contact_type")
    if contact_type == 'email':
        user_contact = user.get('email')
    # elif contact_type == 'phone':
    #     user_contact = user.get('phone_number')
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
            send_otp_email(
                user_contact,
                otp,
                current_app.config['EMAIL_SENDER'],
                current_app.config['EMAIL_PASSWORD']
            )
            message = "OTP sent to your email."
        # else:
        #     send_otp_sms(client, user_contact, otp, "houss")
        #     message = "OTP sent to your phone."

        return jsonify({'status': 'success', 'message': message})
    except Exception as e:
        return jsonify({'status': 'error', 'message': f"Server error: {str(e)}"}), 500





@bp.route('/verify_forget', methods=['POST'])
def verify_forget():
    data = request.get_json()
    otp = data.get('otp')
    email = data.get('email')
    application = data.get('application_name')
    user = get_user_by_contact(email, application)
    if not user:
        return jsonify({'status': 'error', 'message': "User not found."}), 404
    email = user['email']
    if not otp or not email:
        return jsonify({'status': 'error', 'message': "Please enter the complete code"}), 400

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
    application = data.get('application_name')

    if not email:
        return jsonify({'status': 'error', 'message': "Email is required."}), 400

    user = get_user_by_contact(email, application)
    if not user:
        return jsonify({'status': 'error', 'message': "User not found."}), 404

    user_email = user.get('email')
    if not user_email:
        return jsonify({'status': 'error', 'message': "User email not found."}), 400

    new_otp = str(random.randint(1000, 9999))
    expires_at = datetime.utcnow() + timedelta(minutes=5)

    if previous_page == "SignUpActivity":
        record = register_otp_storage.get(user_email)
        if not record:
            return jsonify({'status': 'error', 'message': "User not found in registration storage."}), 404
        record['otp'] = new_otp
        record['expires_at'] = expires_at
        record['attempts'] = 0
        print(f"[DEBUG] OTP updated in register_otp_storage for {user_email}: {register_otp_storage[user_email]}")
    else:
        old_record = otp_storage.get(user_email, {})
        otp_storage[user_email] = {
            'otp': new_otp,
            'expires_at': expires_at,
            'attempts': 0,
            'new_email': old_record.get('new_email')
        }
        print(f"[DEBUG] OTP updated in otp_storage for {user_email}: {otp_storage[user_email]}")

    try:
        send_otp_email(user_email, new_otp, current_app.config['EMAIL_SENDER'], current_app.config['EMAIL_PASSWORD'])
        print(f"[INFO] New OTP sent to {user_email}: {new_otp}")
        return jsonify({'status': 'success', 'message': "New OTP sent to your email."}), 200
    except Exception as e:
        print("Error sending OTP:", str(e))
        return jsonify({'status': 'error', 'message': f"Server error: {str(e)}"}), 500


@bp.route('/send_ask_and_response', methods=['POST'])
def send_ask_and_response():
    try:
        data = request.get_json()
        print("Received data in combined endpoint:", data)

        username = data.get('username')
        date_str = data.get('date')  # ex: "Tuesday, 03 June 16:50"
        comment = data.get('comment')
        qr_code = data.get('qr_code')
        responses = data.get('responses')  # liste de dicts: [{'question_id':1, 'response':'Yes'}, ...]

        # Vérifications basiques
        if not all([username, date_str, comment, qr_code, responses]):
            return jsonify({'status': 'error', 'message': 'Missing data'}), 400

        # Parse date
        parts = date_str.split(', ')
        if len(parts) != 2:
            return jsonify({'status': 'error', 'message': "Date format incorrect"}), 400

        date_time_str = parts[1]
        current_year = datetime.now().year
        full_datetime_str = f"{date_time_str} {current_year}"
        appointment_datetime = datetime.strptime(full_datetime_str, "%d %B %H:%M %Y")

        date_only = appointment_datetime.date()
        time_only = appointment_datetime.time()

        conn = get_db_connection()
        reset_auto_increment(conn, "ask_repair")
        cursor = conn.cursor()

        # Insert ask_repair
        cursor.execute(
            "INSERT INTO ask_repair (username, date, hour_slot, comment, qr_code) VALUES (%s, %s, %s, %s, %s)",
            (username, date_only, time_only, comment, qr_code)
        )
        ask_repair_id = cursor.lastrowid
        print(f"Inserted ask_repair with id: {ask_repair_id}")
        reset_auto_increment(conn, "responses")
        # Insert responses
        for resp in responses:
            question_id = resp.get('question_id')
            response_text = resp.get('response')
            if not question_id or not response_text:
                conn.rollback()
                return jsonify({'status': 'error', 'message': 'Missing question_id or response in responses list'}), 400

            cursor.execute(
                "INSERT INTO responses (question_id, response, username, qr_code, ask_repair_id) VALUES (%s, %s, %s, %s, %s)",
                (question_id, response_text, username, qr_code, ask_repair_id)
            )
            print(f"Inserted response for question_id {question_id}")

        conn.commit()
        cursor.close()
        conn.close()

        return jsonify({'status': 'success', 'message': 'Request repair sent successfully ', 'ask_repair_id': ask_repair_id}), 200

    except Exception as e:
        print("Error in combined endpoint:", e)
        if conn:
            conn.rollback()
            cursor.close()
            conn.close()
        return jsonify({'status': 'error', 'message': f'Erreur : {str(e)}'}), 500

    

@bp.route('/change-password', methods=['POST'])
def change_password_forget():
    data = request.json
    email = data.get('email')
    application = data.get('application_name')
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
        cursor.execute("""
            UPDATE users SET password_hash = %s WHERE (email = %s OR username = %s) and application = %s
        """, (hashed_password, email, email, application))
        conn.commit()
        return jsonify({'message': 'Password updated successfully!'}), 200
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

        send_otp_email(new_email, otp, current_app.config['EMAIL_SENDER'], current_app.config['EMAIL_PASSWORD'])

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
        cursor.execute("SELECT * FROM users WHERE phone_number=%s ", (format_number_simple(phone, code)))
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
            SET phone_number = %s
            WHERE phone_number = %s ;

            """, (format_number_simple(new_phone, new_code), format_number_simple(phone, code)))
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

        send_otp_email(email, otp, current_app.config['EMAIL_SENDER'], current_app.config['EMAIL_PASSWORD'])
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
    qr_code = data.get('qr_code')
    country = data.get('country')
    city = data.get('city')
    zone = data.get('zone')
    street = data.get('street')
    exact_location = data.get('exact_location')
    # Vérification des champs obligatoires
    required_fields = [username, qr_code, country, city, zone, street, exact_location]
    if not all(required_fields):
        return jsonify({'status': 'error', 'message': 'All fields are required'}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Mise à jour du QR code avec toutes les infos de localisation
        cursor.execute("""
            UPDATE qr_codes
            SET 
                user = %s,
                country = %s,
                city = %s,
                zone = %s,
                street = %s,
                exact_location = %s,
                is_active = TRUE
            WHERE qr_code = %s
        """, (
            username,
            country,
            city,
            zone,
            street,
            exact_location,
            qr_code
        ))

        if cursor.rowcount == 0:
            return jsonify({'status': 'error', 'message': 'QR code not found.'}), 404

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

    username = data.get('username')
    role = data.get('role')
    qr_code = data.get('qr_code')
    application = data.get('application_name')

    if not qr_code:
        return jsonify({'status': 'error', 'message': 'QR code is required.'}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Vérifier l'existence du QR code
        cursor.execute("SELECT is_active FROM qr_codes WHERE qr_code = %s AND application = %s", (qr_code, application))
        qr_result = cursor.fetchone()

        if qr_result is None:
            return jsonify({'status': 'error', 'message': 'Unknown QR code'}), 404

        is_active = qr_result[0]

        # Si le QR code est inactif
        if not is_active:
            return jsonify({
                'status': 'success',
                'message': 'QR code is not active',
                'is_active': False
            }), 200

        # Vérifier si l'utilisateur est autorisé (si role = user)
        if role == "user":
            cursor.execute(
                "SELECT * FROM qr_codes WHERE qr_code = %s AND user = %s",
                (qr_code, username)
            )
            user_qr = cursor.fetchone()
            if not user_qr:
                return jsonify({
                    'status': 'error',
                    'message': 'QR code is not valid for this user.'
                }), 403  # Forbidden

        # Vérifier s’il y a une réparation en cours
        cursor.execute(
            "SELECT id, status FROM ask_repair WHERE qr_code = %s AND status = %s",
            (qr_code, "Processing")
        )
        repair_status = cursor.fetchone()

        # Réponse générale
        response = {
            'status': 'success',
            'message': 'QR code is active',
            'is_active': True
        }

        if repair_status:
            response.update({
                'status_repair': repair_status[1],
                'id_ask_repair': repair_status[0],
                'message': 'QR code is active and currently under repair (Processing)'
            })
        elif role == "admin":
            response['message'] = 'QR code is active with no repair request'

        return jsonify(response), 200

    except mysql.connector.Error as err:
        print(str(err))
        return jsonify({'status': 'error', 'message': f'Database error: {str(err)}'}), 500

    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()





from datetime import datetime
@bp.route('/ask_repair', methods=['GET'])
def ask_repair():
    username = request.args.get('username')
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        if username:
            cursor.execute(
                "SELECT id, username, date, comment, qr_code, hour_slot, status FROM ask_repair WHERE username = %s",
                (username,)
            )
        else:
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


@bp.route('/cancel_appointment', methods=['POST'])
def cancel_appointment():
    import traceback
    try:
        data = request.get_json()
        repair_id = data.get('id')

        if not repair_id:
            return jsonify({'status': 'error', 'message': 'Missing repair id'}), 400

        conn = get_db_connection()
        cursor = conn.cursor()

        # Récupérer username et qr_code pour la ligne à supprimer
        cursor.execute("SELECT username, qr_code FROM ask_repair WHERE id = %s", (repair_id,))
        result = cursor.fetchone()
        if not result:
            return jsonify({'status': 'error', 'message': 'Repair not found'}), 404
        
        username, qr_code = result

        # Supprimer la ligne dans ask_repair
        cursor.execute("DELETE FROM ask_repair WHERE id = %s", (repair_id,))

        # Supprimer les lignes correspondantes dans responses
        cursor.execute(
            "DELETE FROM responses WHERE username = %s AND qr_code = %s",
            (username, qr_code)
        )

        conn.commit()

        cursor.execute("SELECT MAX(id) FROM responses;")
        max_id = cursor.fetchone()[0]
        new_auto_inc = (max_id or 0) + 1
        cursor.execute(f"ALTER TABLE responses AUTO_INCREMENT = {new_auto_inc};")

        conn.commit()

        cursor.execute("SELECT MAX(id) FROM ask_repair;")
        max_id = cursor.fetchone()[0]
        new_auto_inc = (max_id or 0) + 1
        cursor.execute(f"ALTER TABLE ask_repair AUTO_INCREMENT = {new_auto_inc};")

        conn.commit()


        return jsonify({'status': 'success', 'message': 'Appointment and related responses deleted successfully'}), 200

    except Exception as e:
        print(traceback.format_exc())
        return jsonify({'status': 'error', 'message': f'Internal server error: {str(e)}'}), 500

    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


@bp.route('/get_qrcodes', methods=['GET'])
def get_qrcodes():
    try:
        connection =get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute("SELECT qr_code FROM qr_codes WHERE is_active = %s", (1,))
        results = cursor.fetchall()


        qrcodes = [row['qr_code'] for row in results if row['qr_code']]  # Exclut les valeurs nulles
        return jsonify({'status': 'success', 'qrcodes': qrcodes}), 200

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

    finally:
        if connection.is_connected():
            cursor.close()
            connection.close()
            


@bp.route('/ask_repair/details/<int:repair_id>', methods=['GET'])
def get_repair_with_responses(repair_id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Récupérer la demande de réparation
        cursor.execute("""
            SELECT id, username, date, comment, qr_code, hour_slot, status
            FROM ask_repair
            WHERE id = %s
        """, (repair_id,))
        repair = cursor.fetchone()

        if not repair:
            return jsonify({'status': 'error', 'message': 'Demande de réparation non trouvée'}), 404

        # Récupérer toutes les réponses associées à cette demande (responses)
        cursor.execute("""
            SELECT response, question_id
            FROM responses
            WHERE ask_repair_id = %s
            ORDER BY question_id ASC
        """, (repair_id,))
        responses = cursor.fetchall()

        # Extraire tous les question_id uniques pour récupérer les questions correspondantes
        question_ids = list({r[1] for r in responses})
        questions_dict = {}

        if question_ids:
            format_strings = ','.join(['%s'] * len(question_ids))
            cursor.execute(f"""
                SELECT id, text
                FROM questions
                WHERE id IN ({format_strings})
            """, tuple(question_ids))
            questions = cursor.fetchall()
            # Construire un dict id -> question_text
            questions_dict = {q[0]: q[1] for q in questions}

        # Préparer les données de la demande
        repair_data = {
            'id': repair[0],
            'username': repair[1],
            'date': repair[2].strftime("%A, %d %b %Y") if repair[2] else None,
            'comment': repair[3],
            'qr_code': repair[4],
            'hour_slot': (
                f"{repair[5].seconds // 3600:02}:{(repair[5].seconds % 3600) // 60:02}:{repair[5].seconds % 60:02}"
                if repair[5] else None
            ),
            'status': repair[6]
        }

        # Préparer la liste des réponses avec question associée
        responses_list = []
        for r in responses:
            responses_list.append({
                'response': r[0],
                'question_id': r[1],
                'question_text': questions_dict.get(r[1], "Question inconnue")
            })

        # Retourner un JSON combiné
        return jsonify({
            'repair': repair_data,
            'responses': responses_list
        }), 200

    except mysql.connector.Error as err:
        return jsonify({'status': 'error', 'message': f'Erreur base de données : {str(err)}'}), 500

    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@bp.route('/add_description', methods=['POST'])
def add_description():
    data = request.json

    repair_id = data.get('id')
    description = data.get('description_probleme')

    if not repair_id or description is None:
        return jsonify({
            'status': 'error',
            'message': 'Champs id et description_probleme requis'
        }), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        update_query = """
            UPDATE ask_repair
            SET description_probleme = %s,status = 'repaired'
            WHERE id = %s
        """
        cursor.execute(update_query, (description, repair_id))
        conn.commit()

        if cursor.rowcount == 0:
            return jsonify({
                'status': 'error',
                'message': 'Aucune demande trouvée avec cet ID'
            }), 404

        return jsonify({
            'status': 'success',
            'message': 'Description mise à jour avec succès'
        }), 200

    except mysql.connector.Error as err:
        return jsonify({
            'status': 'error',
            'message': str(err)
        }), 500

    finally:
        cursor.close()
        conn.close()

@bp.route('/get_repair_by_qrcode_full', methods=['GET'])
def get_repair_by_qrcode_full():
    try:
        qr_code = request.args.get('qr_code')
        if not qr_code:
            return jsonify({'status': 'error', 'message': "Le paramètre 'qr_code' est requis."}), 400

        connection = get_db_connection()
        cursor = connection.cursor()

        query = "SELECT * FROM ask_repair WHERE qr_code = %s"
        cursor.execute(query, (qr_code,))
        results = cursor.fetchall()

        if not results:
            return jsonify({'status': 'error', 'message': "Aucune donnée trouvée pour ce QR code."}), 404

        # Pour chaque ligne, reconstruire un dict en formatant la date comme dans ton exemple
        formatted_results = []
        for row in results:
            # Exemple : adapter les noms de colonnes selon ta table
            formatted_row = {
                'id': row[0],
                'username': row[1],
                'date': row[2].strftime("%A, %d %b %Y") if row[2] else None,
                'comment': row[3],
                'qr_code': row[4],
                'hour_slot': (
                    f"{row[5].seconds // 3600:02}:{(row[5].seconds % 3600) // 60:02}:{row[5].seconds % 60:02}"
                    if row[5] else None
                ),
                'status': row[6],
                'description_problem': row[7]
                # ajoute d'autres champs si nécessaire
            }
            formatted_results.append(formatted_row)

        return jsonify({'status': 'success', 'data': formatted_results}), 200

    except Exception as e:
        return jsonify({'status': 'error', 'message': f"Erreur serveur : {str(e)}"}), 500

    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'connection' in locals() and connection.is_connected():
            connection.close()

@bp.route('/format_phone', methods=['POST'])
def format_phone():
    data = request.json
    number = data.get('number')
    country_code = data.get('country_code')

    if not number or not country_code:
        return jsonify({"error": "Missing 'number' or 'country_code'"}), 400

    formatted = format_number_simple(number, country_code)

    if formatted.startswith("Error") or formatted == "Invalid phone number":
        return jsonify({"error": formatted}), 400

    return jsonify({"formatted_number": formatted})












#Endpoint for web application react

@bp.route("/generate_qr", methods=["POST"])
def generate_qr():
    data = request.get_json()
    count = int(data.get("count", 1))
    application = data.get("application", "")
    qr_list = []

    conn = get_db_connection()
    cursor = conn.cursor()

    # Récupérer l'ID maximum existant
    cursor.execute("SELECT MAX(id) FROM qr_codes")
    max_id_result = cursor.fetchone()
    current_id = max_id_result[0] or 0  # Si aucun ID encore présent, on commence à 0

    output_folder = os.path.join(current_app.root_path, "static", "qr")
    generated = 0

    while generated < count:
        code, path = generate_qr_code(output_folder)

        try:
            current_id += 1  # Incrémente l'ID localement

            cursor.execute("""
                INSERT INTO qr_codes (id, qr_code, is_active, application)
                VALUES (%s, %s, %s, %s)
            """, (current_id, code, 0, application))

            conn.commit()

            qr_list.append({
                "id": current_id,
                "code": code,
                "image_path": f"/static/qr/{os.path.basename(path)}"
            })
            generated += 1

        except mysql.connector.IntegrityError as e:
            if e.errno == 1062:  # Code déjà existant
                current_id -= 1  # Annuler l'incrémentation
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
    application = data.get("application", "")
    conn = get_db_connection()
    cursor = conn.cursor()

    # Récupérer le max id actuel
    cursor.execute("SELECT MAX(id) FROM questions")
    max_id = cursor.fetchone()[0]
    if max_id is None:
        max_id = 0
    new_id = max_id + 1

    # Insérer la question avec l'id spécifié
    cursor.execute(
        "INSERT INTO questions (id, text, application) VALUES (%s, %s, %s)",
        (new_id, text, application)
    )
    conn.commit()

    cursor.close()
    conn.close()

    return jsonify({"message": "Question ajoutée", "id": new_id}), 201


@bp.route('/questions', methods=['GET'])  # utilisé par l'application mobile Kotlin
def get_questions():
    application = request.args.get('application')  # Récupère le paramètre ?application=...

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        if application:
            cursor.execute("SELECT id, text FROM questions WHERE application = %s", (application,))
        else:
            cursor.execute("SELECT id, text FROM questions")

        questions = cursor.fetchall()

        # Retourne une liste de dictionnaires avec les questions
        questions_list = [{'id': row[0], 'text': row[1]} for row in questions]

        return jsonify(questions_list)

    except mysql.connector.Error as err:
        return jsonify({'status': 'error', 'message': f'Database error: {str(err)}'}), 500
    finally:
        if conn:
            cursor.close()
            conn.close()


@bp.route('/delete_question/<int:question_id>', methods=['DELETE'])
def delete_question(question_id):
    conn = None
    try:
        # Connexion à la base de données MySQL
        conn = get_db_connection()
        cursor = conn.cursor()

        # 1. Supprimer la question
        cursor.execute("DELETE FROM questions WHERE id = %s", (question_id,))
        conn.commit()

        # 2. Récupérer le MAX(id) restant dans la table
        cursor.execute("SELECT MAX(id) FROM questions;")
        max_id = cursor.fetchone()[0]

        # 3. Définir la nouvelle valeur d'AUTO_INCREMENT (max_id + 1 ou 1 si vide)
        new_auto_inc = (max_id or 0) + 1
        cursor.execute(f"ALTER TABLE questions AUTO_INCREMENT = {new_auto_inc};")
        conn.commit()

        return jsonify({
            "status": "success",
            "message": "Question successfully deleted",
            "next_id": new_auto_inc
        }), 200

    except mysql.connector.Error as err:
        return jsonify({
            'status': 'error',
            'message': f'Database error: {str(err)}'
        }), 500

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


# 📘 GET: Récupérer le champ about_us
@bp.route('/about_us', methods=['GET'])
def get_about_us():
    application = request.args.get('application')  # Récupère le paramètre ?application=...
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("SELECT about_us FROM static_pages WHERE application = %s", (application, ))
    result = cursor.fetchone()

    cursor.close()
    conn.close()

    if not result:
        return jsonify({"error": "Content not found"}), 404

    return jsonify(result)

# ✏️ PUT: Modifier le champ about_us
@bp.route('/about_us', methods=['PUT'])
def update_about_us():
    application = request.args.get('application')  # Récupère le paramètre ?application=...
    data = request.get_json()
    new_text = data.get('about_us', '').strip()

    if not new_text:
        return jsonify({"error": "Text is required"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("UPDATE static_pages SET about_us = %s WHERE application = %s", (new_text, application))
    conn.commit()

    cursor.close()
    conn.close()

    return jsonify({"message": "✅ About Us updated successfully.", "about_us": new_text})

# 📘 GET: Récupérer le champ term_of_use
@bp.route('/term_of_use', methods=['GET'])
def get_term_of_use():
    application = request.args.get('application')  # Récupère le paramètre ?application=...
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT term_of_use FROM static_pages WHERE application = %s", (application, ))
    result = cursor.fetchone()
    cursor.close()
    conn.close()

    if not result:
        return jsonify({"error": "Content not found"}), 404

    return jsonify(result)

# ✏️ PUT: Modifier le champ term_of_use
@bp.route('/term_of_use', methods=['PUT'])
def update_term_of_use():
    data = request.get_json()
    new_text = data.get('term_of_use', '').strip()
    application = request.args.get('application')  # Récupère le paramètre ?application=...

    if not new_text:
        return jsonify({"error": "Text is required"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE static_pages SET term_of_use = %s WHERE application = %s", (new_text, application))
    conn.commit()
    cursor.close()
    conn.close()

    return jsonify({"message": "✅ Terms of Use updated successfully.", "term_of_use": new_text})


# 📘 GET: Récupérer le champ privacy_policy
@bp.route('/privacy_policy', methods=['GET'])
def get_privacy_policy():
    application = request.args.get('application')  # Récupère le paramètre ?application=...
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT privacy_policy FROM static_pages WHERE application = %s", (application, ))
    result = cursor.fetchone()
    cursor.close()
    conn.close()

    if not result:
        return jsonify({"error": "Content not found"}), 404

    return jsonify(result)

# ✏️ PUT: Modifier le champ privacy_policy
@bp.route('/privacy_policy', methods=['PUT'])
def update_privacy_policy():
    application = request.args.get('application')  # Récupère le paramètre ?application=...
    data = request.get_json()
    new_text = data.get('privacy_policy', '').strip()

    if not new_text:
        return jsonify({"error": "Text is required"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE static_pages SET privacy_policy = %s WHERE application = %s", (new_text, application))
    conn.commit()
    cursor.close()
    conn.close()

    return jsonify({"message": "✅ Privacy Policy updated successfully.", "privacy_policy": new_text})

# 📘 GET : récupérer toutes les tâches help (id, title_help, help)
@bp.route('/help_tasks', methods=['GET'])
def get_help_tasks():
    application = request.args.get('application')  # Récupère le paramètre ?application=...
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        "SELECT id, title_help, help FROM help_tasks WHERE application = %s ORDER BY id ASC",
        (application,)
    )
    tasks = cursor.fetchall()
    cursor.close()
    conn.close()

    if not tasks:
        return jsonify({"error": "No help tasks found"}), 404

    return jsonify({"tasks": tasks})

# ✏️ PUT : modifier une tâche help par id
@bp.route('/help_tasks/<int:task_id>', methods=['PUT'])
def update_help_task(task_id):
    data = request.get_json()
    new_title = data.get('title_help', '').strip()
    new_content = data.get('help', '').strip()

    if not new_title or not new_content:
        return jsonify({"error": "Both title_help and help fields are required"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM help_tasks WHERE id = %s", (task_id,))
    existing = cursor.fetchone()

    if not existing:
        cursor.close()
        conn.close()
        return jsonify({"error": "Help task not found"}), 404

    cursor.execute(
        "UPDATE help_tasks SET title_help = %s, help = %s WHERE id = %s",
        (new_title, new_content, task_id)
    )
    conn.commit()
    cursor.close()
    conn.close()

    return jsonify({
        "message": "✅ Help task updated successfully.",
        "task": {"id": task_id, "title_help": new_title, "help": new_content}
    })

# ➕ POST add new help task
@bp.route('/help_tasks', methods=['POST'])
def add_help_task():
    data = request.get_json()
    title_help = data.get('title_help', '').strip()
    help_text = data.get('help', '').strip()
    application = data.get('application', '')
    if not title_help or not help_text:
        return jsonify({"error": "Le titre et le contenu sont obligatoires"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO help_tasks (title_help, help, application) VALUES (%s, %s, %s)",
        (title_help, help_text, application)
    )

    conn.commit()
    new_id = cursor.lastrowid
    cursor.close()
    conn.close()

    return jsonify({
        "message": "✅ Tâche ajoutée avec succès.",
        "task": {
            "id": new_id,
            "title_help": title_help,
            "help": help_text
        }
    }), 201

# 🗑 DELETE help task by id
@bp.route('/help_tasks/<int:task_id>', methods=['DELETE'])
def delete_help_task(task_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM help_tasks WHERE id = %s", (task_id,))
    conn.commit()
    cursor.execute("SELECT MAX(id) FROM help_tasks;")
    max_id = cursor.fetchone()[0]
    new_auto_inc = (max_id or 0) + 1
    cursor.execute(f"ALTER TABLE help_tasks AUTO_INCREMENT = {new_auto_inc};")

    conn.commit()

    cursor.close()
    conn.close()

    return jsonify({"message": "✅ Tâche supprimée avec succès."})


@bp.route('/login_web', methods=['POST'])
def login_web():
    data = request.get_json()
    if not data:
        return jsonify({'status': 'error', 'message': "No data received."}), 400

    email_raw = data.get('email', '')
    password = data.get('password')

    email, email_errors = validate_email_format(email_raw)

    if email_errors:
        return jsonify({'status': 'error', 'errors': email_errors}), 400

    if not password:
        return jsonify({'status': 'error', 'message': 'Password is required.'}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users_web WHERE email=%s", (email,))
        user = cursor.fetchone()
    except Exception as err:
        return jsonify({'status': 'error', 'message': f'Database error: {str(err)}'}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

    if not user:
        return jsonify({'status': 'error', 'message': "Incorrect email or password."}), 404

    try:
        hashed_password = user[2]
        if isinstance(hashed_password, str):
            hashed_password = hashed_password.encode('utf-8')

        if verify_password(password, hashed_password):
            role = user[7] if len(user) > 7 else None
            application = user[5] if len(user) > 5 else None
            return jsonify({
                'status': 'success',
                'message': "Login successful!",
                'role': role,
                'application': application
            }), 200
        else:
            return jsonify({'status': 'error', 'message': "Incorrect email or password."}), 401
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'Processing error: {str(e)}'}), 500

@bp.route('/signup', methods=['POST'])
def signup():
    data = request.get_json()
    if not data:
        return jsonify({'status': 'error', 'message': 'No data received.'}), 400

    required_fields = ["email", "city", "country", "application", "password", "confirm_password"]
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

    cursor = None
    conn = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM users_web WHERE email = %s", (email,))
        if cursor.fetchone():
            return jsonify({'status': 'error', 'message': "Username or email already exists."}), 400

        role = "user"

        otp = str(random.randint(1000, 9999))
        expires_at = datetime.utcnow() + timedelta(minutes=5)
        password_hash = hash_password(password)
        if isinstance(password_hash, bytes):
            password_hash = password_hash.decode('utf-8')

        register_otp_storage[email] = {
            'email': email,
            'password_hash': password_hash,
            'city': data['city'],
            'country': data['country'],
            'application': data['application'],
            'role': role,
            'otp': otp,
            'expires_at': expires_at,
            'attempts': 0
        }

        send_otp_email(email, otp, current_app.config['EMAIL_SENDER'], current_app.config['EMAIL_PASSWORD'])

        return jsonify({"message": "OTP sent to your email."}), 200

    except Exception as e:
        return jsonify({'status': 'error', 'message': f"Server error: {str(e)}"}), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

@bp.route('/verify_otp', methods=['POST'])
def verify_otp():
    data = request.get_json()
    if not data:
        return jsonify({'status': 'error', 'message': 'No data provided.'}), 400

    email = data.get('email')
    otp = data.get('otp')

    if not email or not otp:
        return jsonify({'status': 'error', 'message': 'Email and OTP are required.'}), 400

    record = register_otp_storage.get(email)

    if not record:
        return jsonify({'status': 'error', 'message': 'No OTP found for this email.'}), 404

    if datetime.utcnow() > record['expires_at']:
        return jsonify({'status': 'error', 'message': 'OTP has expired.'}), 400

    if otp != record['otp']:
        record['attempts'] += 1
        return jsonify({'status': 'error', 'message': 'Invalid OTP.'}), 400

    # OTP correct, on récupère les infos stockées
    email = record['email']
    password_hash = record['password_hash']
    city = record['city']
    country = record['country']
    application = record['application']
    role = record['role']

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Vérifier si l'utilisateur existe déjà
        cursor.execute("SELECT * FROM users_web WHERE email = %s", (email,))
        existing_user = cursor.fetchone()
        if existing_user:
            return jsonify({'status': 'error', 'message': 'User already exists.'}), 400

        # Récupérer le max id existant
        cursor.execute("SELECT MAX(id) FROM users_web")
        max_id_result = cursor.fetchone()
        max_id = max_id_result[0] if max_id_result[0] is not None else 0
        new_id = max_id + 1

        # Insérer l'utilisateur
        cursor.execute("""
            INSERT INTO users_web (id, email, password_hash, city, country, application, role, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
        """, (new_id, email, password_hash, city, country, application, role))

        # ✅ Insérer aussi dans static_pages
        cursor.execute("""
            INSERT INTO static_pages (application)
            VALUES (%s)
        """, (application,))

        conn.commit()

    except Exception as e:
        return jsonify({'status': 'error', 'message': f'Database error: {str(e)}'}), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

    # Suppression du stockage temporaire OTP après succès
    register_otp_storage.pop(email, None)

    return jsonify({'status': 'success', 'message': 'OTP verified and user registered successfully.'}), 200
