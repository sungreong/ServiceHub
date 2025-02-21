import os

# JWT 설정
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# 도메인 설정
ALLOWED_DOMAIN = os.getenv("ALLOWED_DOMAIN", "gmail.com")
