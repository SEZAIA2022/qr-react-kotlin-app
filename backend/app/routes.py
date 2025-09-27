import hashlib
import logging
import smtplib
import string
import mysql.connector
import os
import json
import random
import re
from datetime import datetime, timedelta
from mysql.connector.errors import IntegrityError  
import firebase_admin
from firebase_admin import messaging, credentials
from email.message import EmailMessage
import uuid


from flask import Blueprint, request, jsonify, current_app
from .utils import (
    format_number_simple,
    generate_qr_code,
    register_otp_storage,
    otp_storage,
    get_user_by_contact,
    hash_password,
    is_email_taken,
    reset_auto_increment,
    send_fcm_notification,
    send_otp_sms,
    validate_email_format,
    verify_password,
    is_valid_password,
    send_otp_email,
    gen_reset_token_opaque,
    hash_token,
    timing_equal,
    send_reset_email_link,
    limit_by_email,
    send_verification_email_link,
    send_change_email_link,
    send_delete_account_email
)
from .database import get_db_connection

bp = Blueprint('main', __name__, url_prefix="/api")


@bp.post("/test_send_reset")
def test_send_reset():
    data = request.get_json(force=True, silent=True) or {}
    to_email = (data.get("to_email") or "").strip()
    reset_url = data.get("reset_url", "https://assistbyscan.com/reset?token=TEST123")

    if not to_email:
        return jsonify({"status": "error", "error": "to_email manquant"}), 400

    use_ssl = str(current_app.config.get("SMTP_USE_SSL", "true")).lower() in ("1","true","yes")

    try:
        send_reset_email_link(
            to_email=to_email,
            reset_url=reset_url,
            sender_email=current_app.config["EMAIL_SENDER"],
            sender_password=current_app.config["EMAIL_PASSWORD"],
            smtp_host=current_app.config["SMTP_HOST"],
            smtp_port=int(current_app.config["SMTP_PORT"]),
            use_ssl=use_ssl,
        )
        return jsonify({"status": "ok", "message": f"Email envoyé à {to_email}"}), 200
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500


@bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data:
        return jsonify({'status': 'error', 'message': "No data received."}), 400

    username = data.get('username')
    password = data.get('password')
    application = data.get('application_name')
    token = data.get('token')  # On récupère le token ici

    if not username or not password:
        return jsonify({'status': 'error', 'message': 'Username or email and password required.'}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM users WHERE (username = %s OR email = %s) AND application = %s",
            (username, username, application)
        )
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

            # Met à jour is_logged et éventuellement token
            try:
                conn = get_db_connection()
                cursor = conn.cursor()
                
                if token:
                    cursor.execute("""
                        UPDATE users 
                        SET is_logged = TRUE, token = %s
                        WHERE (username = %s OR email = %s) AND application = %s
                    """, (token, username, username, application))
                else:
                    cursor.execute("""
                        UPDATE users 
                        SET is_logged = TRUE
                        WHERE (username = %s OR email = %s) AND application = %s
                    """, (username, username, application))
                
                conn.commit()

            except Exception as err:
                if conn:
                    conn.rollback()
                return jsonify({'status': 'error', 'message': f'Update error: {str(err)}'}), 500
            finally:
                if cursor: cursor.close()
                if conn: conn.close()

            return jsonify({
                'status': 'success',
                'message': "Login successful!",
                'role': role,
                'user': user,
                'email': email
            }), 200
        else:
            return jsonify({'status': 'error', 'message': "Incorrect username or password."}), 401
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'Processing error: {str(e)}'}), 500




@bp.route('/register_token', methods=['POST'])
def register_token():
    data = request.json
    if not data:
        return jsonify({"error": "Data is required"}), 400

    username = data.get('username')
    application = data.get('application_name')
    token = data.get('token')

    if not all([username, application, token]):
        return jsonify({"error": "username, application_name and token are required"}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute(
            "UPDATE users SET token = %s WHERE username = %s AND application = %s",
            (token, username, application)
        )
        conn.commit()
        return jsonify({"message": "Token enregistré"}), 200

    except Exception as e:
        print(str(e))
        if conn:
            conn.rollback()
        return jsonify({"error": str(e)}), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@bp.route('/logout', methods=['POST'])
def logout():
    data = request.get_json()
    if not data:
        return jsonify({'status': 'error', 'message': "No data received."}), 400

    username = data.get('username')
    application = data.get('application_name')

    if not username or not application:
        return jsonify({'status': 'error', 'message': 'Username and application name are required.'}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE users SET is_logged = FALSE
            WHERE (username = %s OR email = %s) AND application = %s
        """, (username, username, application))
        conn.commit()

        if cursor.rowcount == 0:
            return jsonify({'status': 'error', 'message': "User not found."}), 404

        return jsonify({'status': 'success', 'message': "Logout successful."}), 200
    except Exception as err:
        return jsonify({'status': 'error', 'message': f'Database error: {str(err)}'}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()




#cred = credentials.Certificate('monprojetandroidkey.json')
firebase_creds_path = os.getenv("FIREBASE_CREDENTIALS")
if not firebase_creds_path or not os.path.isfile(firebase_creds_path):
    raise FileNotFoundError(f"Firebase credentials not found at {firebase_creds_path}")
cred = credentials.Certificate(firebase_creds_path)



firebase_admin.initialize_app(cred)


@bp.route('/notify_admin', methods=['POST'])
def notify_admin():
    data = request.get_json()
    data = request.get_json()

    if not data:
        return jsonify({"error": "Missing JSON data"}), 400

    message_text = data.get('message', 'New notification')
    role = data.get('role')
    email = data.get('email')
    application = data.get('application_name')

    if not all([role, email, application]):
        return jsonify({"error": "'role', 'email', and 'application_name' fields are required"}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # Select tokens for users who match the role, email, application and are logged in
        cursor.execute(
            "SELECT token FROM users WHERE role = %s AND is_logged = TRUE AND application = %s AND email = %s",
            (role, application, email)
        )
        rows = cursor.fetchall()
        admin_tokens = [row['token'] for row in rows]

        if not admin_tokens:
            return jsonify({"error": "No admin tokens registered"}), 400

        # Choose title based on role
        title = "Confirm" if role == 'user' else "Ask repair"

    except Exception as e:
        print("Error:", str(e))
        return jsonify({"error": str(e)}), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

    # Crée un MulticastMessage avec la notification et la liste des tokens
    multicast_message = messaging.MulticastMessage(
         data={
            "title": title,
            "body": message_text
        },
        tokens=list(admin_tokens)
    )

    try:
        # Envoie un seul MulticastMessage, pas une liste de messages
        response = messaging.send_each_for_multicast(multicast_message)

        return jsonify({
            "success": True,
            "success_count": response.success_count,
            "failure_count": response.failure_count,
            "responses": [r.__dict__ for r in response.responses],
        }), 200

    except Exception as e:
        print("Erreur:", str(e))
        return jsonify({"error": str(e)}), 500




@bp.route('/get_nearest_admin_email', methods=['POST'])
def get_nearest_admin_email():
    data = request.get_json()
    email = data.get('email')
    application = data.get('application_name')
    date = data.get('date')          # format "YYYY-MM-DD"
    hour_slot = data.get('hour_slot') # format "HH:mm"

    if not (email and application and date and hour_slot):
        return jsonify({'status': 'error', 'message': 'Missing parameters'}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)  # important : dict cursor

        # Étape 1 : récupérer les infos du user
        cursor.execute("""
            SELECT city
            FROM users
            WHERE email = %s AND application = %s AND role = 'user'
        """, (email, application))
        user_info = cursor.fetchone()

        if not user_info:
            return jsonify({'status': 'error', 'message': 'Utilisateur non trouvé ou rôle invalide.'}), 404

        city = user_info['city']

        # Étape 2 : chercher admin avec adresse exacte
        cursor.execute("""
            SELECT username, email
            FROM users
            WHERE role = 'admin' AND city = %s AND application = %s
        """, (city, application))
        technicians = cursor.fetchall()

        if not technicians:
            return jsonify({'status': 'error', 'message': 'No technicians found'}), 404

        # Trouver les techniciens déjà pris à cette date et créneau
        cursor.execute("""
            SELECT user_tech FROM ask_repair
            WHERE date = %s AND hour_slot = %s AND application = %s AND status = 'processing'
        """, (date, hour_slot, application))
        taken_techs = set(row['user_tech'] for row in cursor.fetchall())

        # Trouver un technicien libre (premier non pris)
        free_tech = None
        for tech in technicians:
            if tech['username'] not in taken_techs:
                free_tech = tech
                break

        if free_tech:
            return jsonify({'status': 'success', 'email': free_tech['email']})
        else:
            return jsonify({'status': 'error', 'message': 'No available technicians at this slot'}), 409


    except Exception as e:
        print(f"Error in /get_nearest_admin_email: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()




@bp.post("/register")
def register():
    data = request.get_json(force=True, silent=True) or {}
    required = ["username","email","password","confirm_password","number","address",
                "country_code","city","postal_code","application_name"]
    errors = []

    # champs requis
    for f in required:
        if not data.get(f):
            errors.append({'field': f, 'message': f"The field '{f.replace('_', ' ').capitalize()}' is required."})

    # email & password checks
    email = (data.get("email") or "").strip().lower()
    email_regex = r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$'
    if email and not re.match(email_regex, email):
        errors.append({'field': 'email', 'message': 'Invalid email format.'})

    password = (data.get("password") or "").strip()
    confirm  = (data.get("confirm_password") or "").strip()
    if not is_valid_password(password):
        errors.append({'field':'password','message':"Password must be at least 8 characters long, include an uppercase letter, a number, and a special character."})
    elif password != confirm:
        errors.append({'field':'confirm_password','message':"Passwords do not match."})

    if errors:
        return jsonify({'status':'error','message':'Validation errors.','errors':errors}), 400

    application_name = (data.get("application_name") or "").strip()
    try:
        cnx = get_db_connection()
        cur = cnx.cursor()

        # 1) email/username déjà pris côté users ?
        cur.execute("""
            SELECT 1 FROM users
             WHERE (LOWER(username)=LOWER(%s) OR LOWER(email)=LOWER(%s))
               AND application=%s
             LIMIT 1
        """, (data["username"], email, application_name))
        if cur.fetchone():
            return jsonify({'status':'error','message':"Username or email already exists."}), 400

        # 2) autorisation via registred_users
        cur.execute("""
            SELECT username, email, role, is_activated
              FROM registred_users
             WHERE (LOWER(username)=LOWER(%s) OR LOWER(email)=LOWER(%s))
               AND application=%s
             LIMIT 1
        """, (data["username"], email, application_name))
        ru = cur.fetchone()
        if not ru:
            return jsonify({'status':'error','message':"Username or email can't be used."}), 400
        role = ru[2]  # colonne role

    finally:
        if cur: cur.close()
        if cnx: cnx.close()

    # Prépare le payload et le token (comme dans /signup)
    pwd_hash = hash_password(password)
    if isinstance(pwd_hash, bytes):
        pwd_hash = pwd_hash.decode('utf-8')

    payload = {
        "flow": "register_user",             # pour distinguer les flux
        "email": email,
        "username": data["username"],
        "password_hash": pwd_hash,
        "number": data["number"],
        "address": data["address"],
        "postal_code": data["postal_code"],
        "city": data["city"],
        "country_code": data["country_code"],
        "role": role,
        "application": application_name
    }

    token = gen_reset_token_opaque(24)
    token_hash = hash_token(token)
    expires_at = datetime.utcnow() + timedelta(minutes=30)

    try:
        cnx = get_db_connection()
        cur = cnx.cursor()

        # Annuler anciennes demandes en attente
        cur.execute("""
          UPDATE email_verifications
             SET status='CANCELLED'
           WHERE email=%s AND status='PENDING'
        """, (email,))
        # Nettoyer les anciennes lignes déjà traitées
        cur.execute("""
          DELETE FROM email_verifications
           WHERE email=%s AND status IN ('CANCELLED','USED')
        """, (email,))
        cur.execute("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM email_verifications")
        next_id = cur.fetchone()[0]
        # Créer la nouvelle demande
    
        cur.execute("""
          INSERT INTO email_verifications
              (id, email, token_hash, payload_json, expires_at, created_ip, user_agent, status, created_at)
          VALUES (%s, %s, %s, %s, %s, %s, %s, 'PENDING', NOW())
        """, (next_id, email, token_hash, json.dumps(payload), expires_at,
              request.remote_addr, request.headers.get("User-Agent","")))
        cnx.commit()
    finally:
        if cur: cur.close()
        if cnx: cnx.close()

    # Envoi du lien
    verify_url = f"https://assistbyscan.com/verify?token={token}&flow=register_user"

    try:
        send_verification_email_link(
            to_email=email,
            verify_url=verify_url,
            sender_email=current_app.config["EMAIL_SENDER"],
            sender_password=current_app.config["EMAIL_PASSWORD"],
            smtp_host=current_app.config["SMTP_HOST"],
            smtp_port=current_app.config["SMTP_PORT"],
            use_ssl=current_app.config["SMTP_USE_SSL"],
        )
    except Exception:
        current_app.logger.exception("[MAIL] verification send failed")

    # Réponse neutre (pas d’info-leak)
    return jsonify({"status":"success","message":"If the email is valid, a verification link has been sent."}), 200




# ---------- Helper commun ----------
def _consume_email_verification(token: str):
    if not token:
        return {"status": "error", "message": "missing token"}, 400

    token_hash = hash_token(token)
    now = datetime.utcnow()

    cnx = None
    cur = None
    try:
        cnx = get_db_connection()
        cur = cnx.cursor(dictionary=True)

        cur.execute("""
          SELECT id, email, payload_json, status, expires_at
            FROM email_verifications
           WHERE token_hash=%s
           ORDER BY id DESC
           LIMIT 1
        """, (token_hash,))
        row = cur.fetchone()

        if (not row) or row["status"] in ("USED", "CANCELLED", "EXPIRED"):
            return {"status": "error", "message": "Invalid or used token."}, 401

        if now > row["expires_at"]:
            cur.execute("UPDATE email_verifications SET status='EXPIRED' WHERE id=%s", (row["id"],))
            cnx.commit()
            return {"status": "error", "message": "Token expired."}, 410

        payload = json.loads(row["payload_json"]) if row["payload_json"] else {}
        flow = payload.get("flow")  # "register_user" pour le flux mobile
        email = payload.get("email")

        # ====== Cas 1 : nouveau flux mobile (users) ======
        if flow == "register_user":
            # Créer l'utilisateur s'il n'existe pas
            cur.execute("""
                SELECT id FROM users
                 WHERE LOWER(email)=LOWER(%s) AND application=%s
                 LIMIT 1
            """, (email, payload.get("application")))
            exists = cur.fetchone()
            cur.execute("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM users")
            next_id = cur.fetchone()["next_id"]


            if not exists:
                cur.execute("""
                  INSERT INTO users
                      (id,username, email, password_hash, phone_number, address, role,
                       city, code_postal, application, created_at)
                  VALUES
                      (%s, %s, %s, %s, %s, %s, %s,
                       %s, %s, %s, NOW())
                """, (
                    next_id,
                    payload.get("username"),
                    email,
                    payload.get("password_hash"),
                    format_number_simple(payload.get("number"), payload.get("country_code")),
                    payload.get("address"),
                    payload.get("role"),
                    payload.get("city"),
                    payload.get("postal_code"),
                    payload.get("application"),
                ))

            # Activer registred_users si présent
            cur.execute("""
                UPDATE registred_users
                   SET is_activated = TRUE
                 WHERE LOWER(email)=LOWER(%s) AND application=%s
            """, (email, payload.get("application")))

            # Marquer le token USED
            cur.execute("""
                UPDATE email_verifications
                   SET status='USED', used_at=%s
                 WHERE id=%s
            """, (now, row["id"]))

            cnx.commit()
            return {"status":"success",
                    "message":"Email verified and account created.",
                    "flow":"register_user"}, 200
        # ====== Cas 2 : ancien flux web (users_web) ======
        # Sécuriser les champs pour éviter KeyError
        city_val = payload.get("city")
        # 'country' peut ne pas exister dans les nouveaux payloads → défaut vide
        country_val = payload.get("country", "")
        app_val = payload.get("application")
        role_val = payload.get("role")
        pwd_hash = payload.get("password_hash")

        # Existe déjà ?
        cur.execute("SELECT id, is_activated FROM users_web WHERE LOWER(email)=LOWER(%s) LIMIT 1", (email,))
        existing = cur.fetchone()

        if existing:
            cur.execute("""
              UPDATE users_web
                 SET password_hash=%s, city=%s, country=%s, application=%s, role=%s,
                     is_activated=1, created_at=NOW()
               WHERE LOWER(email)=LOWER(%s)
            """, (pwd_hash, city_val, country_val, app_val, role_val, email))
        else:
            cur.execute("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM users_web")
            next_id = cur.fetchone()[0]
            cur.execute("""
              INSERT INTO users_web (id, email, password_hash, city, country, application, role, created_at, is_activated)
              VALUES (%s, %s, %s, %s, %s, %s, %s, NOW(), 1)
            """, (next_id, email, pwd_hash, city_val, country_val, app_val, role_val))

        cur.execute("UPDATE email_verifications SET status='USED', used_at=%s WHERE id=%s", (now, row["id"]))
        cnx.commit()
        return {"status":"success",
                "message":"Email verified and account activated.",
                "flow":"users_web"}, 200

    except Exception as e:
        current_app.logger.exception(e)
        return {"status": "error", "message": "Database error."}, 500
    finally:
        try:
            if cur: cur.close()
            if cnx: cnx.close()
        except:
            pass


# ---------- Routes publiques (2 entrées, même logique) ----------

# 1) Front Web : tu postes actuellement sur /api/email/verify
@bp.route("/email/verify", methods=["GET", "POST"])
def email_verify():
    if request.method == "GET":
        token = (request.args.get("token") or "").strip()
    else:
        data = request.get_json(force=True, silent=True) or {}
        token = (data.get("token") or "").strip()

    body, status = _consume_email_verification(token)
    return jsonify(body), status


# 2) Mobile/Android : garde /email/verify_register pour compat
@bp.post("/email/verify_register")
def email_verify_register():
    data = request.get_json(force=True, silent=True) or {}
    token = (data.get("token") or "").strip()
    body, status = _consume_email_verification(token)
    return jsonify(body), status




# /forgot_password  → même logique que /password/forgot
@bp.post("/forgot_password")
def forgot_password():
    data = request.get_json(force=True, silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    application = (data.get("application_name") or "").strip()

    # Réponse neutre (pas d’info-leak) si email/application manquants
    if not email or not application:
        return jsonify({"status": "success", "message": "If the account exists, a reset email has been sent."}), 200

    # (Facultatif) check existence sans changer la réponse
    try:
        cnx = get_db_connection()
        cur = cnx.cursor()
        cur.execute("""
            SELECT 1 FROM users
             WHERE LOWER(email)=LOWER(%s) AND LOWER(application)=LOWER(%s)
             LIMIT 1
        """, (email, application))
        exists = cur.fetchone() is not None
    finally:
        cur.close(); cnx.close()

    # Génère un token même si l’email n’existe pas (réponse neutre)
    token = gen_reset_token_opaque(24)
    token_hash = hash_token(token)
    expires_at = datetime.utcnow() + timedelta(minutes=15)

    try:
        cnx = get_db_connection()
        cur = cnx.cursor()

        # 1) Annule les demandes actives pour cet email+application
        cur.execute("""
          UPDATE password_reset_requests
             SET status='CANCELLED'
           WHERE LOWER(email)=LOWER(%s)
             AND LOWER(COALESCE(application,''))=LOWER(COALESCE(%s,''))
             AND status IN ('PENDING','VERIFIED')
        """, (email, application))

        # 2) Purge l’historique traité
        cur.execute("""
          DELETE FROM password_reset_requests
           WHERE LOWER(email)=LOWER(%s)
             AND LOWER(COALESCE(application,''))=LOWER(COALESCE(%s,''))
             AND status IN ('CANCELLED','USED')
        """, (email, application))
        cur.execute("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM password_reset_requests")
        next_id = cur.fetchone()[0]
        # 3) Crée la nouvelle demande
        cur.execute("""
          INSERT INTO password_reset_requests
              (id, email, application, token_hash, status, expires_at, created_ip, user_agent)
          VALUES (%s, %s, %s, %s, 'PENDING', %s, %s, %s)
        """, (next_id, email, application, token_hash, expires_at,
              request.remote_addr, request.headers.get("User-Agent","")))
        cnx.commit()
    except Exception:
        current_app.logger.exception("[DB] insert password_reset_requests failed")
        # Réponse neutre malgré l’erreur pour ne rien révéler
        return jsonify({"status":"success","message":"If the account exists, a reset email has been sent."}), 200
    finally:
        cur.close(); cnx.close()

    # Envoi email (même si l’email n’existe pas)
    reset_url = f"https://assistbyscan.com/create-new-password?token={token}&mode=app"
    try:
        send_reset_email_link(
            to_email=email,
            reset_url=reset_url,
            sender_email=current_app.config["EMAIL_SENDER"],
            sender_password=current_app.config["EMAIL_PASSWORD"],
            smtp_host=current_app.config["SMTP_HOST"],
            smtp_port=current_app.config["SMTP_PORT"],
            use_ssl=current_app.config["SMTP_USE_SSL"],
        )
    except Exception:
        current_app.logger.exception("[MAIL] reset email failed")
        # on garde la réponse neutre

    return jsonify({"status":"success","message":"If the account exists, a reset email has been sent."}), 200



# /verify_forget  → même logique que /password/verify
@bp.post("/verify_forget")
def verify_forget():
    data = request.get_json(force=True, silent=True) or {}
    token = (data.get("token") or "").strip()
    if not token:
        return jsonify({"error":"missing_token"}), 400

    token_hash = hash_token(token)
    now = datetime.utcnow()

    # 1) Charger la demande
    try:
        cnx = get_db_connection()
        cur = cnx.cursor(dictionary=True)
        cur.execute("""
          SELECT id, email, application, status, expires_at, attempts
            FROM password_reset_requests
           WHERE token_hash=%s
           ORDER BY id DESC
           LIMIT 1
        """, (token_hash,))
        row = cur.fetchone()
    finally:
        cur.close(); cnx.close()

    if not row or row["status"] in ("USED","CANCELLED","EXPIRED"):
        return jsonify({"error":"invalid_or_used"}), 401

    # 2) Expiration
    if now > row["expires_at"]:
        try:
            cnx = get_db_connection()
            cur = cnx.cursor()
            cur.execute("UPDATE password_reset_requests SET status='EXPIRED' WHERE id=%s", (row["id"],))
            cnx.commit()
        finally:
            cur.close(); cnx.close()
        return jsonify({"error":"expired"}), 410

    # 3) (Optionnel) passer en VERIFIED (comme /password/verify)
    try:
        cnx = get_db_connection()
        cur = cnx.cursor()
        cur.execute("""
            UPDATE password_reset_requests
               SET status='VERIFIED', verified_at=%s
             WHERE id=%s AND status='PENDING'
        """, (now, row["id"]))
        cnx.commit()
    finally:
        cur.close(); cnx.close()

    return jsonify({"ok": True}), 200


@bp.post("/change-password")
def change_password_forget():
    data = request.get_json(force=True, silent=True) or {}
    token = (data.get("token") or "").strip()
    new_password = (data.get("new_password") or "").strip()
    confirm_password = (data.get("confirm_password") or "").strip()

    # validations
    if not token or not new_password or not confirm_password:
        return jsonify({"error":"missing_fields"}), 400
    if new_password != confirm_password:
        return jsonify({"error":"password_mismatch"}), 400
    if not is_valid_password(new_password):
        return jsonify({"error":"weak_password"}), 400

    token_hash = hash_token(token)
    now = datetime.utcnow()

    cnx = None
    cur = None
    try:
        cnx = get_db_connection()
        cur = cnx.cursor(dictionary=True)

        # 1) chercher la demande de reset
        cur.execute("""
          SELECT id, email, application, status, expires_at
            FROM password_reset_requests
           WHERE token_hash=%s
           ORDER BY id DESC
           LIMIT 1
        """, (token_hash,))
        row = cur.fetchone()

        if not row or row["status"] in ("USED","CANCELLED","EXPIRED"):
            return jsonify({"error":"invalid_or_used"}), 401

        if now > row["expires_at"]:
            cur2 = cnx.cursor()
            cur2.execute("UPDATE password_reset_requests SET status='EXPIRED' WHERE id=%s", (row["id"],))
            cnx.commit()
            cur2.close()
            return jsonify({"error":"expired"}), 410

        email = row["email"]
        application = row.get("application")

        # 2) update du mot de passe (users puis fallback users_web)
        new_hash = hash_password(new_password)
        if isinstance(new_hash, bytes):
            new_hash = new_hash.decode("utf-8")

        cur.execute("""
          UPDATE users
             SET password_hash=%s
           WHERE LOWER(email)=LOWER(%s)
             AND LOWER(COALESCE(application,''))=LOWER(COALESCE(%s,''))
        """, (new_hash, email, application))
        affected = cur.rowcount

        if affected == 0:
            cur.execute("""
              UPDATE users_web
                 SET password_hash=%s
               WHERE LOWER(email)=LOWER(%s)
                 AND LOWER(COALESCE(application,''))=LOWER(COALESCE(%s,''))
                 AND is_activated=1
            """, (new_hash, email, application))
            affected = cur.rowcount

        # 3) consommer le token
        cur.execute("""
          UPDATE password_reset_requests
             SET status='USED', used_at=%s
           WHERE id=%s
        """, (now, row["id"]))
        cnx.commit()

        # réponse neutre si aucun compte n’a été affecté
        if affected == 0:
            return jsonify({"message":"Password reset processed"}), 200

        return jsonify({"message":"Password updated"}), 200

    except Exception as e:
        current_app.logger.exception(e)
        return jsonify({"error":"database_error"}), 500
    finally:
        if cur: cur.close()
        if cnx: cnx.close()




@bp.route('/send_ask_and_response', methods=['POST'])
def send_ask_and_response():
    try:
        data = request.get_json()
        username = data.get('username')
        date_str = data.get('date')  # ex: "Tuesday, 03 June 16:50"
        comment = data.get('comment')
        qr_code = data.get('qr_code')
        application = data.get('application_name')
        responses = data.get('responses')  # liste de dicts: [{'question_id':1, 'response':'Yes'}, ...]
        technician_email = data.get('technician_email')
        print (data)
        # Vérifications basiques
        if not all([username, date_str, comment, qr_code, responses, technician_email]):
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
        cursor.execute("SELECT username FROM users WHERE email = %s AND application = %s",(technician_email, application))
        users_tech = cursor.fetchone()
        user_tech = users_tech[0]
        # Insert ask_repair
        cursor.execute(
            "INSERT INTO ask_repair (username, date, hour_slot, comment, qr_code, user_tech, application) VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (username, date_only, time_only, comment, qr_code, user_tech, application)
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
                "INSERT INTO responses (question_id, response, username, qr_code, ask_repair_id, application) VALUES (%s, %s, %s, %s, %s, %s)",
                (question_id, response_text, username, qr_code, ask_repair_id, application)
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

    


@bp.route('/change_username', methods=['POST'])
def change_username():
    data = request.get_json()
    if not data:
        return jsonify({'status': 'error', 'message': 'No data received.'}), 400
    new_username = data.get('new_username')
    username = data.get('username')
    password = data.get('password')
    application = data.get('application_name')

    if not username or not password or not new_username:
        return jsonify({'status': 'error', 'message': 'All champs requis'}), 400
    try:
        # Connexion à la base de données MySQL
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE username=%s and application = %s ", (username, application))
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
                UPDATE users SET username = %s WHERE username = %s AND application = %s
            """, (new_username, username, application))
            cursor.execute("""
                UPDATE registred_users SET username = %s WHERE username = %s AND application = %s
            """, (new_username, username, application))
            conn.commit()
            return jsonify({'status': 'success', 'message': 'Username changed!'}), 200
        else:
            return jsonify({'status': 'error', 'message': "User not found or incorrect password."}), 300
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'Processing error.: {str(e)}'}), 500


@bp.post("/change_email")
def change_email():
    data = request.get_json(force=True, silent=True) or {}
    email       = (data.get('email') or '').strip().lower()
    new_email   = (data.get('new_email') or '').strip().lower()
    password    = (data.get('password') or '').strip()
    application = (data.get('application_name') or '').strip()

    # validations basiques (réponse neutre sur le résultat final)
    if not email or not new_email or not password or not application:
        return jsonify({'status':'error','message':'All fields are required.'}), 400
    if email == new_email:
        return jsonify({'status':'error','message':'New email cannot be the same as current email.'}), 400

    email_regex = r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$'
    if not re.match(email_regex, email) or not re.match(email_regex, new_email):
        return jsonify({'status':'error','message':'The email format is invalid.'}), 400

    # 1) Vérifier le compte et le mot de passe sans info-leak vers l’extérieur
    try:
        cnx = get_db_connection()
        cur = cnx.cursor()
        cur.execute("""
            SELECT password_hash
              FROM users
             WHERE LOWER(email)=LOWER(%s) AND LOWER(application)=LOWER(%s)
             LIMIT 1
        """, (email, application))
        row = cur.fetchone()
        if not row:
            # compte introuvable → réponse neutre
            return jsonify({'status':'success','message':'If valid, a confirmation link was sent to the new email.'}), 200

        stored_hash = row[0]
        if isinstance(stored_hash, str):
            stored_hash = stored_hash.encode('utf-8')
        if not verify_password(password, stored_hash):
            # mauvais mot de passe → message explicite (utile UX)
            return jsonify({'status':'error','message':'Incorrect password.'}), 401
    except Exception as e:
        current_app.logger.exception(e)
        return jsonify({'status':'error','message':'Database error.'}), 500
    finally:
        if cur: cur.close()
        if cnx: cnx.close()

    # 2) Préparer et enregistrer la demande (flow=change_email)
    token      = gen_reset_token_opaque(24)
    token_hash = hash_token(token)
    expires_at = datetime.utcnow() + timedelta(minutes=30)
    payload = {
        "flow": "change_email",
        "current_email": email,
        "new_email": new_email,
        "application": application
    }

    try:
        cnx = get_db_connection()
        cur = cnx.cursor()

        # Annuler anciennes demandes PENDING pour ce current_email + flow
        try:
            # Annuler PENDING
            cur.execute("""
            UPDATE email_verifications
                SET status='CANCELLED'
            WHERE LOWER(email)=LOWER(%s)
                AND status='PENDING'
                AND JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.flow')) = 'change_email'
            """, (email,))
        except Exception:
            # fallback si JSON_EXTRACT indispo
            cur.execute("""
              UPDATE email_verifications
                 SET status='CANCELLED'
               WHERE LOWER(email)=LOWER(%s) AND status='PENDING'
            """, (email,))

        try:
            # Purger USED/CANCELLED
            cur.execute("""
            DELETE FROM email_verifications
            WHERE LOWER(email)=LOWER(%s)
                AND status IN ('CANCELLED','USED')
                AND JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.flow')) = 'change_email'
            """, (email,))
        except Exception:
            cur.execute("""
              DELETE FROM email_verifications
               WHERE LOWER(email)=LOWER(%s) AND status IN ('CANCELLED','USED')
            """, (email,))
        cur.execute("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM email_verifications")
        next_id = cur.fetchone()[0]
        # Créer la nouvelle demande ; on met email = current_email comme clé
        cur.execute("""
          INSERT INTO email_verifications
              (id, email, application, token_hash, payload_json, expires_at, created_ip, user_agent, status, created_at)
          VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'PENDING', NOW())
        """, (next_id, email, application, token_hash, json.dumps(payload), expires_at,
              request.remote_addr, request.headers.get("User-Agent","")))
        cnx.commit()
    except Exception as e:
        current_app.logger.exception(e)
        # Réponse neutre pour ne rien révéler
        return jsonify({'status':'success','message':'If valid, a confirmation link was sent to the new email.'}), 200
    finally:
        if cur: cur.close()
        if cnx: cnx.close()

    # 3) Envoyer le lien au **nouvel** e-mail (c’est lui qui doit confirmer)
    confirm_url = f"https://assistbyscan.com/verify?token={token}&flow=change_email"
    try:
        send_change_email_link(
            to_email=new_email,
            verify_url=confirm_url,
            sender_email=current_app.config["EMAIL_SENDER"],
            sender_password=current_app.config["EMAIL_PASSWORD"],
            smtp_host=current_app.config["SMTP_HOST"],
            smtp_port=current_app.config["SMTP_PORT"],
            use_ssl=current_app.config["SMTP_USE_SSL"],
        )
    except Exception:
        current_app.logger.exception("[MAIL] change_email send failed")

    # Réponse neutre
    return jsonify({'status':'success','message':'If valid, a confirmation link was sent to the new email.'}), 200


@bp.post("/verify_change_email")
def verify_change_email():
    data = request.get_json(force=True, silent=True) or {}
    token = (data.get("token") or "").strip()
    if not token:
        return jsonify({'status':'error','message':'missing token'}), 400

    token_hash = hash_token(token)
    now = datetime.utcnow()

    try:
        cnx = get_db_connection()
        cur = cnx.cursor(dictionary=True)
        cur.execute("""
          SELECT id, email, application, payload_json, status, expires_at
            FROM email_verifications
           WHERE token_hash=%s
           ORDER BY id DESC
           LIMIT 1
        """, (token_hash,))
        row = cur.fetchone()
        if not row or row["status"] in ("USED","CANCELLED","EXPIRED"):
            return jsonify({'status':'error','message':'invalid_or_used'}), 401

        if now > row["expires_at"]:
            cur2 = cnx.cursor()
            cur2.execute("UPDATE email_verifications SET status='EXPIRED' WHERE id=%s", (row["id"],))
            cnx.commit()
            cur2.close()
            return jsonify({'status':'error','message':'expired'}), 410

        payload      = json.loads(row["payload_json"])
        if payload.get("flow") != "change_email":
            return jsonify({'status':'error','message':'invalid_flow'}), 400

        current_email = payload["current_email"].strip().lower()
        new_email     = payload["new_email"].strip().lower()
        application   = payload.get("application") or row.get("application")

        # Vérifier collision éventuelle: si new_email déjà utilisé sur la même application
        cur.execute("""
          SELECT 1 FROM users
           WHERE LOWER(email)=LOWER(%s) AND LOWER(application)=LOWER(%s)
           LIMIT 1
        """, (new_email, application))
        if cur.fetchone():
            # conflit propre : on n'update pas, on marque USED pour ne pas réutiliser
            cur.execute("UPDATE email_verifications SET status='USED', used_at=%s WHERE id=%s",
                        (now, row["id"]))
            cnx.commit()
            return jsonify({'status':'error','message':'new_email_already_in_use'}), 409

        # (si tu dois refléter ailleurs)
        cur.execute("""
          UPDATE registred_users
             SET username=%s
           WHERE username=%s AND LOWER(application)=LOWER(%s)
        """, (new_email, current_email, application))

        # Mettre à jour l'email principal
        cur.execute("""
          UPDATE users
             SET email=%s
           WHERE LOWER(email)=LOWER(%s) AND LOWER(application)=LOWER(%s)
        """, (new_email, current_email, application))
        affected = cur.rowcount

        # Consommer le token
        cur.execute("UPDATE email_verifications SET status='USED', used_at=%s WHERE id=%s",
                    (now, row["id"]))
        cnx.commit()

        if affected == 0:
            # pas d’update (compte introuvable à ce stade) → réponse neutre
            return jsonify({'status':'success','message':'Email change processed.'}), 200

        return jsonify({'status':'success','message':'Email changed successfully.'}), 200

    except Exception as e:
        current_app.logger.exception(e)
        return jsonify({'status':'error','message':f'Database error: {str(e)}'}), 500
    finally:
        if cur: cur.close()
        if cnx: cnx.close()


@bp.post("/delete_account")
def delete_account():
    """
    Étape 1 : l’utilisateur saisit email + password.
    On vérifie le mot de passe, puis on crée une demande dans email_verifications
    (flow=delete_account) avec un lien de confirmation.
    """
    data = request.get_json(force=True, silent=True) or {}
    email       = (data.get("email") or "").strip().lower()
    password    = (data.get("password") or "").strip()
    application = (data.get("application_name") or "").strip()

    # --- validations de base
    if not email or not password or not application:
        return jsonify({"status": "error",
                        "message": "Email, password and application_name are required."}), 400
    if not re.match(r"^[\w.+-]+@[\w-]+\.[\w.-]+$", email):
        return jsonify({"status": "error",
                        "message": "Invalid email format."}), 400

    # --- vérifier le compte & le mot de passe (réponse neutre si email inconnu)
    try:
        cnx = get_db_connection()
        cur = cnx.cursor()
        cur.execute("""
            SELECT password_hash
              FROM users
             WHERE LOWER(email)=LOWER(%s) AND LOWER(application)=LOWER(%s)
             LIMIT 1
        """, (email, application))
        row = cur.fetchone()
        if not row:
            # réponse neutre pour ne rien révéler
            return jsonify({"status": "success",
                            "message": "If valid, a confirmation link was sent to your email."}), 200

        stored_hash = row[0]
        if isinstance(stored_hash, str):
            stored_hash = stored_hash.encode("utf-8")
        if not verify_password(password, stored_hash):
            return jsonify({"status": "error", "message": "Incorrect password."}), 401
    except Exception as e:
        current_app.logger.exception(e)
        return jsonify({"status": "error", "message": f"Database error: {e}"}), 500
    finally:
        if cur: cur.close()
        if cnx: cnx.close()

    # --- créer la demande dans email_verifications
    token      = gen_reset_token_opaque(24)
    token_hash = hash_token(token)
    expires_at = datetime.utcnow() + timedelta(minutes=30)
    payload = {
        "flow": "delete_account",
        "email": email,
        "application": application
    }

    try:
        cnx = get_db_connection()
        cur = cnx.cursor()

        # annule anciennes demandes PENDING du même flow
        cur.execute("""
          UPDATE email_verifications
             SET status='CANCELLED'
           WHERE LOWER(email)=LOWER(%s)
             AND status='PENDING'
             AND JSON_EXTRACT(payload_json,'$.flow')='delete_account'
        """, (email,))
        # supprime anciens USED/CANCELLED pour éviter l’index unique
        cur.execute("""
          DELETE FROM email_verifications
           WHERE LOWER(email)=LOWER(%s)
             AND status IN ('CANCELLED','USED')
             AND JSON_EXTRACT(payload_json,'$.flow')='delete_account'
        """, (email,))
        cur.execute("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM email_verifications")
        next_id = cur.fetchone()[0]
        # nouvel enregistrement
        cur.execute("""
          INSERT INTO email_verifications
              (id, email, application, token_hash, payload_json,
               expires_at, created_ip, user_agent, status, created_at)
          VALUES (%s, %s,%s,%s,%s,%s,%s,%s,'PENDING',NOW())
        """, (next_id, email, application, token_hash,
              json.dumps(payload), expires_at,
              request.remote_addr, request.headers.get("User-Agent","")))
        cnx.commit()
    except Exception as e:
        current_app.logger.exception(e)
        return jsonify({"status": "success",
                        "message": "If valid, a confirmation link was sent to your email."}), 200
    finally:
        if cur: cur.close()
        if cnx: cnx.close()

    # --- envoyer l’email avec lien de confirmation
    confirm_url = f"https://assistbyscan.com/verify?token={token}&flow=delete_account"
    try:
        send_delete_account_email(
            to_email=email,
            verify_url=confirm_url,
            sender_email=current_app.config["EMAIL_SENDER"],
            sender_password=current_app.config["EMAIL_PASSWORD"],
            smtp_host=current_app.config["SMTP_HOST"],
            smtp_port=current_app.config["SMTP_PORT"],
            use_ssl=current_app.config["SMTP_USE_SSL"],
        )
    except Exception:
        current_app.logger.exception("[MAIL] delete_account send failed")

    return jsonify({"status": "success",
                    "message": "If valid, a confirmation link was sent to your email."}), 200


@bp.post("/verify_delete_account")
def verify_delete_account():
    """
    Étape 2 : confirmation via le lien reçu.
    On consomme le token et supprime définitivement le compte.
    """
    data  = request.get_json(force=True, silent=True) or {}
    token = (data.get("token") or "").strip()
    if not token:
        return jsonify({"status": "error", "message": "missing token"}), 400

    token_hash = hash_token(token)
    now = datetime.utcnow()

    try:
        cnx = get_db_connection()
        cur = cnx.cursor(dictionary=True)
        cur.execute("""
          SELECT id, email, application, payload_json, status, expires_at
            FROM email_verifications
           WHERE token_hash=%s
           ORDER BY id DESC LIMIT 1
        """, (token_hash,))
        row = cur.fetchone()
        if not row or row["status"] in ("USED","CANCELLED","EXPIRED"):
            return jsonify({"status": "error", "message": "invalid_or_used"}), 401

        if now > row["expires_at"]:
            cur.execute("UPDATE email_verifications SET status='EXPIRED' WHERE id=%s", (row["id"],))
            cnx.commit()
            return jsonify({"status": "error", "message": "expired"}), 410

        payload     = json.loads(row["payload_json"])
        if payload.get("flow") != "delete_account":
            return jsonify({"status": "error", "message": "invalid_flow"}), 400

        email       = payload["email"]
        application = payload.get("application") or row.get("application")

        # suppression de l’utilisateur
        cur.execute("""
          DELETE FROM users
           WHERE LOWER(email)=LOWER(%s) AND LOWER(application)=LOWER(%s)
        """, (email, application))
        cur.execute("""
          DELETE FROM registred_users
           WHERE LOWER(email)=LOWER(%s) AND LOWER(application)=LOWER(%s)
        """, (email, application))
        affected = cur.rowcount

        # consommer le token
        cur.execute("UPDATE email_verifications SET status='USED', used_at=%s WHERE id=%s",
                    (now, row["id"]))
        cnx.commit()

        if affected == 0:
            # utilisateur déjà supprimé ou inexistant → réponse neutre
            return jsonify({"status": "success", "message": "Account deletion processed."}), 200

        return jsonify({"status": "success", "message": "Account successfully deleted."}), 200

    except Exception as e:
        current_app.logger.exception(e)
        return jsonify({"status": "error", "message": f"Database error: {e}"}), 500
    finally:
        if cur: cur.close()
        if cnx: cnx.close()










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
    application = data.get('application_name')
    if not phone or not password or not new_phone or not code or not new_code:
        return jsonify({'status': 'error', 'message': 'All champs requis'}), 400
    try:
        # Connexion à la base de données MySQL
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE phone_number=%s and application = %s ", (format_number_simple(phone, code)))
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
            WHERE phone_number = %s and application = %s ;

            """, (format_number_simple(new_phone, new_code), format_number_simple(phone, code), application ))
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
    application = data.get('application_name')
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
        cursor.execute("SELECT * FROM users WHERE (email = %s OR username = %s) AND application = %s ", (email, email, application))
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
    if role not in ("user", "admin"):
        return jsonify({'status': 'error', 'message': 'Invalid role'}), 400
    if not application:
        return jsonify({'status': 'error', 'message': 'Application name is required.'}), 400

    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor(dictionary=True) as cursor:
            # Vérifier l'existence du QR code
            cursor.execute(
                "SELECT is_active FROM qr_codes WHERE qr_code = %s AND application = %s",
                (qr_code, application)
            )
            qr_result = cursor.fetchone()
            if qr_result is None:
                return jsonify({'status': 'error', 'message': 'Unknown QR code'}), 404
            if not qr_result['is_active']:
                return jsonify({'status': 'success', 'message': 'QR code is not active', 'is_active': False}), 200

            # Vérifier si l'utilisateur est autorisé
            if role == "user":
                cursor.execute(
                    "SELECT * FROM qr_codes WHERE qr_code = %s AND user = %s",
                    (qr_code, username)
                )
                user_qr = cursor.fetchone()
                if not user_qr:
                    return jsonify({'status': 'error', 'message': 'QR code is not valid for this user.'}), 403

            # Vérifier s’il y a une réparation en cours
            if role == "admin":
                cursor.execute(
                    """
                    SELECT id, status, user_tech 
                    FROM ask_repair 
                    WHERE qr_code = %s AND status = %s AND user_tech = %s
                    """,
                    (qr_code, "Processing", username)
                )
            else:  # user
                cursor.execute(
                    "SELECT id, status FROM ask_repair WHERE qr_code = %s AND status = %s",
                    (qr_code, "Processing")
                )
            repair_status = cursor.fetchone()
            logging.info(f"Repair status: {repair_status}")

            # Construire la réponse
            response = {'status': 'success', 'is_active': True}

            if repair_status:
                response.update({
                    'status_repair': repair_status['status'],
                    'id_ask_repair': repair_status['id'],
                    'message': 'QR code is active and currently under repair (Processing)'
                })
            else:
                if role == "admin":
                    response['message'] = 'QR code is active with no repair request'
                else:  # user
                    response['message'] = 'QR code is active'

            return jsonify(response), 200

    except mysql.connector.Error as err:
        logging.error(f"Database error: {err}")
        return jsonify({'status': 'error', 'message': f'Database error: {str(err)}'}), 500
    except Exception as e:
        logging.error(f"Unexpected error: {e}")
        return jsonify({'status': 'error', 'message': f'Unexpected error: {str(e)}'}), 500
    finally:
        if conn and conn.is_connected():
            conn.close()



from datetime import datetime
@bp.route('/ask_repair', methods=['GET'])
def ask_repair():
    username = request.args.get('username')
    application = request.args.get('application') 
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        if username:
            cursor.execute(
                "SELECT id, username, date, comment, qr_code, hour_slot, status, user_tech FROM ask_repair WHERE username = %s AND application = %s",
                (username, application)
            )
        else:
            cursor.execute("SELECT id, username, date, comment, qr_code, hour_slot, status, user_tech FROM ask_repair WHERE application = %s",
                           (application, ))

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
            'status': row[6],
            'user_tech': row[7]
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
    user = request.args.get('user')
    application = request.args.get('application')
    if not user or not application:
        return jsonify({'status': 'error', 'message': 'User and application parameters are required'}), 400
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT city FROM users WHERE username = %s and application = %s", (user, application))
        result = cursor.fetchone()
        if not result:
            return jsonify({'status': 'error', 'message': 'User not found'}), 404
        city = result[0]
        cursor.execute("""
            SELECT COUNT(*) FROM users
            WHERE role = 'admin'
            AND city = %s
            AND application = %s
        """, (city, application))
        total_techs = cursor.fetchone()[0]

        cursor.execute("""
            SELECT date, hour_slot, COUNT(*) AS taken_count
            FROM ask_repair ar
            JOIN users u ON ar.user_tech = u.username
            WHERE u.role = 'admin'
            AND u.city = %s
            AND ar.application = %s
            AND ar.status IN ('processing', 'repaired')
            GROUP BY date, hour_slot
        """, (city, application))

        rows = cursor.fetchall()
        taken_slots = {}
        for date, hour, count in rows:
            date_str = date.strftime("%Y-%m-%d")
            
            # Convertir timedelta en HH:mm
            total_seconds = hour.total_seconds()
            hours = int(total_seconds // 3600)
            minutes = int((total_seconds % 3600) // 60)
            hour_str = f"{hours:02}:{minutes:02}"

            taken_slots.setdefault(date_str, {})[hour_str] = count



        return jsonify({
            'status': 'success',
            'total_techs': total_techs,
            'taken_slots': taken_slots
        }), 200


    except mysql.connector.Error as err:
        return jsonify({'status': 'error', 'message': f'Database error: {str(err)}'}), 500

    finally:
        if conn:
            cursor.close()
            conn.close()


@bp.route('/cancel_appointment', methods=['POST'])
def cancel_appointment():
    import traceback
    conn = None
    cursor = None
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
        try:
            if cursor:
                cursor.close()
            if conn and getattr(conn, "is_connected", lambda: False)():
                conn.close()
        except Exception:
            pass



@bp.route('/get_qrcodes', methods=['GET'])
def get_qrcodes():
    application = request.args.get('application')
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            "SELECT qr_code FROM qr_codes WHERE is_active = %s AND application = %s",
            (1, application)
        )
        results = cursor.fetchall()

        qrcodes = [row['qr_code'] for row in results if row['qr_code']]
        return jsonify({'status': 'success', 'qrcodes': qrcodes}), 200

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

    finally:
        try:
            if cursor:
                cursor.close()
            if connection and getattr(connection, "is_connected", lambda: False)():
                connection.close()
        except Exception:
            pass

            


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
        user_tech = request.args.get('user_tech')

        if not qr_code or not user_tech:
            return jsonify({'status': 'error', 'message': "All data is required."}), 400

        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        # Récupérer toutes les réparations "repaired" ou "processing" du technicien
        query = """
            SELECT *
            FROM ask_repair
            WHERE qr_code = %s AND (
                status = 'repaired'
                OR (status = 'processing' AND user_tech = %s)
            )
        """
        cursor.execute(query, (qr_code, user_tech))
        results = cursor.fetchall()

        if not results:
            return jsonify({'status': 'error', 'message': "Aucune donnée trouvée pour ce QR code."}), 404

        formatted_results = []
        for row in results:
            username = row.get('username')
            application = row.get('application')  # Assure-toi que ce champ est dans la table `ask_repair`

            # Récupérer l'adresse de l'utilisateur à partir de la table users
            cursor.execute("""
                SELECT address, city
                FROM users
                WHERE username = %s AND application = %s
            """, (username, application))
            user_data = cursor.fetchone()
            full_address = None
            if user_data:
                address_part = user_data.get('address') or ''
                city_part = user_data.get('city') or ''
                full_address = f"{address_part}, {city_part}".strip(', ')

            formatted_row = {
                'id': row.get('id'),
                'username': username,
                'date': row.get('date').strftime("%A, %d %b %Y") if row.get('date') else None,
                'comment': row.get('comment'),
                'qr_code': row.get('qr_code'),
                'hour_slot': (
                    f"{row['hour_slot'].seconds // 3600:02}:{(row['hour_slot'].seconds % 3600) // 60:02}:{row['hour_slot'].seconds % 60:02}"
                    if row.get('hour_slot') else None
                ),
                'status': row.get('status'),
                'description_problem': row.get('description_problem'),
                'user_tech': row.get('user_tech'),
                'address': full_address
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

    # Get current max ID to avoid conflicts
    cursor.execute("SELECT MAX(id) FROM qr_codes")
    max_id_result = cursor.fetchone()
    current_id = max_id_result[0] or 0

    output_folder = os.path.join(current_app.root_path, "static", "qr")

    for _ in range(count):
        # 1) Génère un code unique
        code = str(uuid.uuid4())

        # 2) Nom de fichier unique (plus d’index)
        filename = f"{application}{current_id}_{code}.png"

        # 3) Payload encodé dans le QR (garde identique à ce que tu stockes en BDD)
        payload = code  # ou f"https://assistbyscan.com/qr/{code}" si tu veux une URL

        # 4) Crée l'image
        path = generate_qr_code(output_folder, application, payload, filename)

        # 5) Insert (laisse MySQL gérer l'AUTO_INCREMENT)
        current_id += 1
        cursor.execute("""
            INSERT INTO qr_codes (id, qr_code, is_active, application, image_path)
            VALUES (%s, %s, %s, %s, %s)
        """, (
            current_id, code, 0, application,
            f"/static/qr/{filename}"
        ))
        conn.commit()

        qr_list.append({
            "id": cursor.lastrowid,
            "code": code,
            "image_path": f"/static/qr/{filename}",
        })

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

    # Get current max id
    cursor.execute("SELECT MAX(id) FROM questions")
    max_id = cursor.fetchone()[0]
    if max_id is None:
        max_id = 0
    new_id = max_id + 1

    # Insert question with specified id
    cursor.execute(
        "INSERT INTO questions (id, text, application) VALUES (%s, %s, %s)",
        (new_id, text, application)
    )
    conn.commit()

    cursor.close()
    conn.close()

    return jsonify({"message": "Question added", "id": new_id}), 201


@bp.route('/questions', methods=['GET'])  # utilisé par l'application mobile Kotlin
def get_questions():
    application = request.args.get('application')  # Récupère le paramètre ?application=...

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT id, text FROM questions WHERE application = %s", (application,))

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
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Vérifier si la question existe
        cursor.execute("SELECT COUNT(*) FROM questions WHERE id = %s", (question_id,))
        if cursor.fetchone()[0] == 0:
            return jsonify({
                "status": "error",
                "message": "Question not found"
            }), 404

        # Supprimer la question
        cursor.execute("DELETE FROM questions WHERE id = %s", (question_id,))
        conn.commit()

        # Récupérer le MAX(id) restant dans la table
        cursor.execute("SELECT MAX(id) FROM questions;")
        max_id = cursor.fetchone()[0]

        # Définir la nouvelle valeur d'AUTO_INCREMENT
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
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@bp.route('/update_question/<int:question_id>', methods=['PUT'])
def update_question(question_id):
    data = request.get_json()
    new_text = data.get('text', '').strip()
    if not new_text:
        return jsonify({'status': 'error', 'message': 'Text cannot be empty.'}), 400
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE questions SET text = %s WHERE id = %s", (new_text, question_id))
        conn.commit()
        return jsonify({"status": "success", "message": "Question updated successfully."}), 200
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

    cursor.execute("SELECT about_us FROM static_pages WHERE application = %s LIMIT 1", (application, ))
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

    return jsonify({"message": " About Us updated successfully.", "about_us": new_text})

# 📘 GET: Récupérer le champ term_of_use
@bp.route('/term_of_use', methods=['GET'])
def get_term_of_use():
    application = request.args.get('application')  # Récupère le paramètre ?application=...
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT term_of_use FROM static_pages WHERE application = %s LIMIT 1", (application, ))
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

    return jsonify({"message": " Terms of Use updated successfully.", "term_of_use": new_text})


# 📘 GET: Récupérer le champ privacy_policy
@bp.route('/privacy_policy', methods=['GET'])
def get_privacy_policy():
    application = request.args.get('application')  # Récupère le paramètre ?application=...
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT privacy_policy FROM static_pages WHERE application = %s LIMIT 1", (application, ))
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

    return jsonify({"message": " Privacy Policy updated successfully.", "privacy_policy": new_text})

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
        "message": " Help task updated successfully.",
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
        "message": " Tâche ajoutée avec succès.",
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

    return jsonify({"message": " Tâche supprimée avec succès."})


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
            print(application)
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





@bp.post("/password/forgot")
def password_forgot():
    data = request.get_json(force=True, silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    if not email:
        return jsonify({"message":"If the account exists, a reset email has been sent."}), 200
    # Cherche l’utilisateur (facultatif, mais utile pour TTL/log) :
    exists = False
    try:
        cnx = get_db_connection()
        cur = cnx.cursor()
        cur.execute("SELECT 1 FROM users_web WHERE LOWER(email)=LOWER(%s) AND is_activated=1 LIMIT 1", (email,))
        exists = cur.fetchone() is not None
    finally:
        cur.close(); cnx.close()

    # Génère même si l’email n’existe pas (neutre)
    token = gen_reset_token_opaque(24)
    token_hash = hash_token(token)
    expires_at = datetime.utcnow() + timedelta(minutes=15)

    try:
        cnx = get_db_connection()
        cur = cnx.cursor()
        # Invalide anciens pending
        cur.execute("""
          UPDATE password_reset_requests 
             SET status='CANCELLED' 
           WHERE email=%s AND status IN ('PENDING','VERIFIED')
        """, (email,))
        # Ensuite la suppression des lignes marquées CANCELLED ou USED
        cur.execute("""
            DELETE FROM password_reset_requests
            WHERE email = %s
            AND status IN ('CANCELLED', 'USED')
        """, (email,))
        cur.execute("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM password_reset_requests")
        next_id = cur.fetchone()[0]
        # Crée la nouvelle demande
        cur.execute("""
          INSERT INTO password_reset_requests 
              (id, email, token_hash, status, expires_at, created_ip, user_agent)
          VALUES (%s, %s, %s, 'PENDING', %s, %s, %s)
        """, (next_id, email, token_hash, expires_at, request.remote_addr, request.headers.get("User-Agent", "") ))
        cnx.commit()
    finally:
        cur.close(); cnx.close()

    # Envoi email (lien magique) — même si email inconnu
    try:
        reset_url = f"https://assistbyscan.com/create-new-password?token={token}"
        send_reset_email_link(
            to_email=email,
            reset_url=reset_url,
            sender_email=current_app.config["EMAIL_SENDER"],
            sender_password=current_app.config["EMAIL_PASSWORD"],
            smtp_host=current_app.config["SMTP_HOST"],
            smtp_port=current_app.config["SMTP_PORT"],
            use_ssl=current_app.config["SMTP_USE_SSL"],
        )

    except Exception:
        current_app.logger.exception("[MAIL] reset email failed")

    return jsonify({"message":"If the account exists, a reset email has been sent."}), 200

@bp.post("/password/verify")
def password_verify():
    data = request.get_json(force=True, silent=True) or {}
    token = (data.get("token") or "").strip()
    if not token:
        return jsonify({"error":"missing_token"}), 400

    token_hash = hash_token(token)
    now = datetime.utcnow()

    try:
        cnx = get_db_connection()
        cur = cnx.cursor(dictionary=True)
        cur.execute("""
          SELECT id, email, status, expires_at, attempts 
            FROM password_reset_requests
           WHERE token_hash=%s
           ORDER BY id DESC LIMIT 1
        """, (token_hash,))
        row = cur.fetchone()
    finally:
        cur.close(); cnx.close()

    if not row or row["status"] in ("USED","CANCELLED","EXPIRED"):
        return jsonify({"error":"invalid_or_used"}), 401
    if now > row["expires_at"]:
        # marque expiré
        try:
            cnx = get_db_connection()
            cur = cnx.cursor()
            cur.execute("UPDATE password_reset_requests SET status='EXPIRED' WHERE id=%s", (row["id"],))
            cnx.commit()
        finally:
            cur.close(); cnx.close()
        return jsonify({"error":"expired"}), 410

    # Optionnel : passer en VERIFIED
    try:
        cnx = get_db_connection()
        cur = cnx.cursor()
        cur.execute("UPDATE password_reset_requests SET status='VERIFIED', verified_at=%s WHERE id=%s",
                    (now, row["id"]))
        cnx.commit()
    finally:
        cur.close(); cnx.close()

    return jsonify({"ok": True}), 200


@bp.post("/password/reset")
def password_reset():
    data = request.get_json(force=True, silent=True) or {}
    token = (data.get("token") or "").strip()
    new_password = data.get("new_password") or ""
    confirm_password = data.get("confirm_password") or ""

    if not token or not new_password or not confirm_password:
        return jsonify({"error":"missing_fields"}), 400
    if new_password != confirm_password:
        return jsonify({"error":"password_mismatch"}), 400
    if not is_valid_password(new_password):
        return jsonify({"error":"weak_password"}), 400

    token_hash = hash_token(token)
    now = datetime.utcnow()

    try:
        cnx = get_db_connection()
        cur = cnx.cursor(dictionary=True)
        cur.execute("""
          SELECT id, email, status, expires_at
            FROM password_reset_requests
           WHERE token_hash=%s
           ORDER BY id DESC LIMIT 1
        """, (token_hash,))
        row = cur.fetchone()
        if not row or row["status"] in ("USED","CANCELLED","EXPIRED"):
            return jsonify({"error":"invalid_or_used"}), 401
        if now > row["expires_at"]:
            cur2 = cnx.cursor()
            cur2.execute("UPDATE password_reset_requests SET status='EXPIRED' WHERE id=%s", (row["id"],))
            cnx.commit()
            cur2.close()
            return jsonify({"error":"expired"}), 410

        # MAJ password
        hashed = hash_password(new_password)
        cur.execute("UPDATE users_web SET password_hash=%s WHERE LOWER(email)=LOWER(%s) AND is_activated=1",
                    (hashed, row["email"]))
        # Marque USED
        cur.execute("UPDATE password_reset_requests SET status='USED', used_at=%s WHERE id=%s",
                    (now, row["id"]))
        cnx.commit()
    finally:
        cur.close(); cnx.close()

    return jsonify({"message":"Password updated"}), 200











@bp.post("/signup")
def signup():
    data = request.get_json(force=True, silent=True) or {}
    required = ["email", "city", "country", "password", "confirm_password"]
    errors = []

    # validations
    email = (data.get("email") or "").strip().lower()
    for f in required:
        if not data.get(f):
            errors.append({'field': f, 'message': f"The field '{f.replace('_',' ').capitalize()}' is required."})
    email_regex = r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$'
    if email and not re.match(email_regex, email):
        errors.append({'field':'email','message':'Invalid email format.'})

    password = (data.get("password") or "").strip()
    confirm  = (data.get("confirm_password") or "").strip()
    if not is_valid_password(password):
        errors.append({'field':'password','message':"Password must be at least 8 characters long, include an uppercase letter, a number, and a special character."})
    elif password != confirm:
        errors.append({'field':'confirm_password','message':"Passwords do not match."})

    if errors:
        return jsonify({'status':'error','message':'Validation errors.','errors':errors}), 400

    # Vérifie si un compte actif existe déjà
    try:
        cnx = get_db_connection()
        cur = cnx.cursor()
        cur.execute("SELECT is_activated, role, application FROM users_web WHERE LOWER(email)=LOWER(%s) LIMIT 1", (email,))
        row = cur.fetchone()
        if row and row[0] == True:
            return jsonify({'status':'error','message':"Email already registered."}), 400
        role = row[1] if row else None
        application = row[2] if row else None
    finally:
        if cur: cur.close()
        if cnx: cnx.close()

    # Prépare la demande
    pwd_hash = hash_password(password)
    if isinstance(pwd_hash, bytes):
        pwd_hash = pwd_hash.decode("utf-8")

    payload = {
        "email": email,
        "password_hash": pwd_hash,
        "city": data["city"],
        "country": data["country"],
        "application": application,
        "role": role
    }

    token = gen_reset_token_opaque(24)
    token_hash = hash_token(token)
    expires_at = datetime.utcnow() + timedelta(minutes=30)

    try:
        cnx = get_db_connection()
        cur = cnx.cursor()

        # Annule anciennes demandes en attente
        cur.execute("""
          UPDATE email_verifications
             SET status='CANCELLED'
           WHERE email=%s AND status='PENDING' AND application = %s
        """, (email, application))
        # Ensuite la suppression des lignes marquées CANCELLED ou VERIFIED
        cur.execute("""
            DELETE FROM email_verifications
            WHERE email = %s
            AND status IN ('CANCELLED', 'USED') AND application = %s
        """, (email, application))
        cur.execute("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM email_verifications")
        next_id = cur.fetchone()[0]
        # Crée une nouvelle demande
        cur.execute("""
          INSERT INTO email_verifications (id, email, application, token_hash, payload_json, expires_at, created_ip, user_agent)
          VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (next_id, email,application, token_hash, json.dumps(payload), expires_at, request.remote_addr, request.headers.get("User-Agent","")))
        cnx.commit()
    finally:
        if cur: cur.close()
        if cnx: cnx.close()

    # Envoi e-mail
    verify_url = f"https://assistbyscan.com/verify?token={token}"
    try:
        send_verification_email_link(
            to_email=email,
            verify_url=verify_url,
            sender_email=current_app.config["EMAIL_SENDER"],
            sender_password=current_app.config["EMAIL_PASSWORD"],
            smtp_host=current_app.config["SMTP_HOST"],
            smtp_port=current_app.config["SMTP_PORT"],
            use_ssl=current_app.config["SMTP_USE_SSL"],
        )
    except Exception:
        # on log mais on répond neutre (pas d’info-leak)
        current_app.logger.exception("[MAIL] verification send failed")

    # Réponse neutre
    return jsonify({"status":"success","message":"If the email is valid, a verification link has been sent."}), 200



@bp.route('/register_user', methods=['POST'])
def register_user():
    data = request.get_json()

    #  Validation des champs
    required_fields = ['email', 'username', 'role', 'application']
    missing_fields = [f for f in required_fields if not data.get(f)]
    if missing_fields:
        return jsonify({
            'success': False,
            'message': f" Missing required field(s): {', '.join(missing_fields)}"
        }), 400

    email = data['email']
    username = data['username']
    role = data['role']
    application = data['application']

    conn = None
    cursor = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # 🔍 Vérifier si l'email existe déjà
        cursor.execute("SELECT id FROM registred_users WHERE email = %s and application = %s", (email, application))
        if cursor.fetchone():
            return jsonify({'success': False, 'message': ' This email is already registered.'}), 400

        # 🔍 Vérifier si username + application existe déjà
        cursor.execute("""
            SELECT id FROM registred_users 
            WHERE username = %s AND application = %s
        """, (username, application))
        if cursor.fetchone():
            return jsonify({'success': False, 'message': ' This username is already used for this application.'}), 400

        # 🔹 Calculer prochain ID
        cursor.execute("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM registred_users")
        next_id = cursor.fetchone()['next_id']

        # 🔹 Insérer le nouvel utilisateur
        insert_query = """
            INSERT INTO registred_users (id, email, username, role, application)
            VALUES (%s, %s, %s, %s, %s)
        """
        cursor.execute(insert_query, (next_id, email, username, role, application))
        conn.commit()

        return jsonify({
            'success': True,
            'message': ' User registered successfully.',
            'id': next_id
        }), 201

    except Exception as e:
        print("Unexpected error:", str(e))
        return jsonify({'success': False, 'message': ' Internal server error. Please try again later.'}), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@bp.route('/qr_history', methods=['GET'])
def qr_history():
    application = request.args.get('application')
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("""
            SELECT qr_code, is_active, image_path
            FROM qr_codes
            WHERE application = %s
            ORDER BY id ASC
        """, (application,))

        results = cursor.fetchall()

        qr_list = [
            {
                "code": row["qr_code"],
                "status": "active" if row["is_active"] == 1 else "inactive",
                "image_path": row.get("image_path", "")
            }
            for row in results
        ]
        return jsonify({"status": "success", "data": qr_list}), 200

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

    finally:
        try:
            if cursor:
                cursor.close()
            if conn and getattr(conn, "is_connected", lambda: False)():
                conn.close()
        except Exception:
            pass

@bp.route('/get_all_user_web', methods=['GET'])
def get_all_users():
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        query = """
        SELECT u.*, 
               IFNULL(q.qrcode_count, 0) AS qrcode_count
        FROM users_web u
        LEFT JOIN (
            SELECT application, COUNT(*) AS qrcode_count
            FROM qr_codes
            GROUP BY application
        ) q ON u.application = q.application
        """
        cursor.execute(query)
        users = cursor.fetchall()

        return jsonify({'status': 'success', 'users': users}), 200

    except Exception as e:
        print(str(e))
        return jsonify({'status': 'error', 'message': str(e)}), 500

    finally:
        try:
            if cursor:
                cursor.close()
            if connection and getattr(connection, "is_connected", lambda: False)():
                connection.close()
        except Exception:
            pass


@bp.route('/user_register_web', methods=['POST'])
def user_register_web():
    data = request.json
    email = data.get('email')
    application = data.get('application')
    role = data.get('role')

    if not email or not role or not application:
        return jsonify({'status': 'error', 'message': 'Missing required fields.'}), 400

    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("SELECT MAX(id) FROM users_web")
        max_id = cursor.fetchone()[0] or 0
        new_id = max_id + 1

        query = """
            INSERT INTO users_web (id, email, application, role, is_activated)
            VALUES (%s, %s, %s, %s, %s)
        """
        cursor.execute(query, (new_id, email, application, role, False))
        connection.commit()

    except Exception as e:
        print(e)
        return jsonify({'status': 'error', 'message': 'Database error.'}), 500

    finally:
        try:
            if cursor:
                cursor.close()
            if connection and getattr(connection, "is_connected", lambda: False)():
                connection.close()
        except Exception:
            pass

    return jsonify({'status': 'success'}), 201


@bp.route('/delete_user_web/<int:user_id>', methods=['DELETE'])
def delete_user_web(user_id):
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("DELETE FROM users_web WHERE id = %s", (user_id,))
        conn.commit()

        if cursor.rowcount == 0:
            return jsonify({'success': False, 'message': 'User not found.'}), 404

        return jsonify({'success': True, 'message': ' User deleted successfully.'})

    except Exception as e:
        print("Error deleting user:", str(e))
        return jsonify({'success': False, 'message': ' Server error.'}), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@bp.route('/get_users', methods=['GET'])
def get_users():
    application = request.args.get('application')
    print(application)

    if not application:
        return jsonify({'success': False, 'message': 'Application parameter is required.'}), 400

    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT id, email, username, role FROM registred_users WHERE application = %s",
            (application,)
        )
        users = cursor.fetchall()

        return jsonify({'success': True, 'users': users}), 200

    except Exception as e:
        print("Unexpected error:", str(e))
        return jsonify({'success': False, 'message': '❌ Internal server error. Please try again later.'}), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()



@bp.route('/delete_user', methods=['POST'])
def delete_user():
    data = request.get_json()
    user_id = data.get('id')

    if not user_id:
        return jsonify({'success': False, 'message': '❌ Missing required field: id'}), 400

    conn = None
    cursor = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("DELETE FROM registred_users WHERE id = %s", (user_id,))
        conn.commit()

        if cursor.rowcount == 0:
            return jsonify({'success': False, 'message': '❌ User not found.'}), 404

        return jsonify({'success': True, 'message': '✅ User deleted successfully.'}), 200

    except Exception as e:
        print("Unexpected error:", str(e))
        return jsonify({'success': False, 'message': '❌ Internal server error. Please try again later.'}), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
