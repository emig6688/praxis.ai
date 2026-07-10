from cryptography.fernet import Fernet
import os
from dotenv import load_dotenv

load_dotenv()

_fernet_key = os.getenv("FERNET_KEY", "")
_fernet = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        if not _fernet_key:
            raise RuntimeError("FERNET_KEY no configurada en .env")
        _fernet = Fernet(_fernet_key.encode())
    return _fernet


def encrypt(text: str) -> str:
    return _get_fernet().encrypt(text.encode()).decode()


def decrypt(token: str) -> str:
    return _get_fernet().decrypt(token.encode()).decode()


def generate_key() -> str:
    return Fernet.generate_key().decode()
