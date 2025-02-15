from sqlalchemy.orm import Session
from app import models, database, auth

# add domain to env
import os

ALLOWED_DOMAIN = os.getenv("ALLOWED_DOMAIN", "gmail.com")


def create_initial_admin():
    db = database.SessionLocal()
    try:
        admin = models.User(
            email=f"admin@{ALLOWED_DOMAIN}", hashed_password=auth.get_password_hash("admin_password"), is_admin=True
        )
        db.add(admin)
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    create_initial_admin()
