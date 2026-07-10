"""
Ejecutar una sola vez para generar la FERNET_KEY y SECRET_KEY.
Copiar los valores al archivo .env
"""
from cryptography.fernet import Fernet
import secrets

print("=== Claves para .env ===\n")
print(f"FERNET_KEY={Fernet.generate_key().decode()}")
print(f"SECRET_KEY={secrets.token_hex(32)}")
print("\nCopiar estos valores en backend/.env")
