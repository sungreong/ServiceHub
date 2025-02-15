from sqlalchemy import Boolean, Column, Integer, String, ForeignKey, Table, Enum, DateTime
from sqlalchemy.orm import relationship
from .database import Base
import enum
from datetime import datetime

# user_services 테이블 정의
user_services = Table(
    "user_services",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("service_id", Integer, ForeignKey("services.id", ondelete="CASCADE"), primary_key=True),
    Column("show_info", Boolean, default=False),
)


# 서비스 요청 상태 enum
class RequestStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    REMOVE_PENDING = "remove_pending"  # 삭제 요청 대기 상태 추가


# UserStatus enum 추가
class UserStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    is_admin = Column(Boolean, default=False)
    status = Column(Enum(UserStatus), default=UserStatus.PENDING)  # 상태 필드 추가
    registration_date = Column(DateTime, default=datetime.utcnow)
    approval_date = Column(DateTime, nullable=True)

    # services 관계 추가
    services = relationship("Service", secondary=user_services, back_populates="users")
    service_requests = relationship("ServiceRequest", back_populates="user")


class Service(Base):
    __tablename__ = "services"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    ip = Column(String)
    port = Column(Integer)
    description = Column(String, nullable=True)
    show_info = Column(Boolean, default=False)  # 서비스 정보(IP:PORT) 공개 여부

    # users 관계 추가
    users = relationship("User", secondary=user_services, back_populates="services")
    requests = relationship("ServiceRequest", back_populates="service")


class ServiceRequest(Base):
    __tablename__ = "service_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    service_id = Column(Integer, ForeignKey("services.id"))
    status = Column(Enum(RequestStatus), default=RequestStatus.PENDING)
    request_date = Column(DateTime, default=datetime.utcnow)
    response_date = Column(DateTime, nullable=True)
    admin_created = Column(Boolean, default=False)  # 관리자가 추가한 요청인지 여부
    user_removed = Column(Boolean, default=False)  # 사용자가 삭제한 요청인지 여부

    user = relationship("User", back_populates="service_requests")
    service = relationship("Service", back_populates="requests")
