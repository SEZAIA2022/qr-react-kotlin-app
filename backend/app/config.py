class Config:
    SECRET_KEY = "SEZAIA2022"
    DB_CONFIG = {
        'user': 'root',
        'password': 'root',
        'host': '127.168.100.229',
        'database': 'projet_sezaia'
    }
    # Twilio
    TWILIO_ACCOUNT_SID = 'ton_account_sid_ici'
    TWILIO_AUTH_TOKEN = 'ton_auth_token_ici'
    TWILIO_PHONE_NUMBER = '+1234567890'

    # Email
    EMAIL_SENDER = "hseinghannoum@gmail.com"
    EMAIL_PASSWORD = "ehybppmrmbueakgo"
