import base64
import hashlib
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from config import CREDENTIAL_ENCRYPTION_KEY


def _encryption_key() -> bytes:
    return hashlib.sha256(CREDENTIAL_ENCRYPTION_KEY.encode("utf-8")).digest()


def decrypt_secret(cipher_text: str) -> str:
    """Decrypt AES-256-GCM payload produced by Frontend/utils/crypto.ts."""
    if not cipher_text:
        return ""

    raw = base64.b64decode(cipher_text)
    iv = raw[:12]
    tag = raw[12:28]
    encrypted = raw[28:]
    aesgcm = AESGCM(_encryption_key())
    plain = aesgcm.decrypt(iv, encrypted + tag, None)
    return plain.decode("utf-8")


def encrypt_secret(plain_text: str) -> str:
    """Encrypt to AES-256-GCM payload compatible with Frontend/utils/crypto.ts."""
    text = (plain_text or "").encode("utf-8")
    iv = os.urandom(12)
    aesgcm = AESGCM(_encryption_key())
    encrypted = aesgcm.encrypt(iv, text, None)
    # encrypted = ciphertext + tag (16 bytes)
    cipher = encrypted[:-16]
    tag = encrypted[-16:]
    payload = iv + tag + cipher
    return base64.b64encode(payload).decode("utf-8")


def has_encrypted_secret(value: str | None) -> bool:
    return bool(value and len(value) > 0)
