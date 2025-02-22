from sqlalchemy import Boolean, Column, Integer, String, ForeignKey, Table, Enum, DateTime, Float
from sqlalchemy.orm import relationship
from .database import Base
import enum
from datetime import datetime

# user_services 테이블 정의
user_services = Table(
    "user_services",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("service_id", String(8), ForeignKey("services.id", ondelete="CASCADE"), primary_key=True),
    Column("show_info", Boolean, default=False),
)

# 사용자별 요청 가능한 서비스 테이블
user_allowed_services = Table(
    "user_allowed_services",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("service_id", String(8), ForeignKey("services.id", ondelete="CASCADE"), primary_key=True),
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

    # 관계 추가
    allowed_services = relationship("Service", secondary=user_allowed_services, back_populates="allowed_users")


class Service(Base):
    __tablename__ = "services"

    id = Column(String(8), primary_key=True)
    name = Column(String, nullable=False)
    protocol = Column(String, nullable=False, default="http")
    host = Column(String, nullable=False)  # IP 또는 도메인
    port = Column(Integer, nullable=True)  # 포트를 선택적으로 변경
    base_path = Column(String, nullable=True)  # 기본 경로 (예: /users/sign_in)
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    show_info = Column(Boolean, default=False)
    is_ip = Column(Boolean, default=True)  # IP 주소 여부

    # users 관계 추가
    users = relationship("User", secondary=user_services, back_populates="services")
    requests = relationship("ServiceRequest", back_populates="service")

    # 관계 추가
    allowed_users = relationship("User", secondary=user_allowed_services, back_populates="allowed_services")

    @property
    def full_url(self) -> str:
        """서비스의 전체 URL을 생성합니다."""
        base = f"{self.protocol}://{self.host}"
        if self.port is not None:
            base += f":{self.port}"
        if self.base_path:
            base += self.base_path
        return base


class ServiceRequest(Base):
    __tablename__ = "service_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    service_id = Column(String(8), ForeignKey("services.id"))
    status = Column(Enum(RequestStatus), default=RequestStatus.PENDING)
    request_date = Column(DateTime, default=datetime.utcnow)
    response_date = Column(DateTime, nullable=True)
    admin_created = Column(Boolean, default=False)  # 관리자가 추가한 요청인지 여부
    user_removed = Column(Boolean, default=False)  # 사용자가 삭제한 요청인지 여부

    user = relationship("User", back_populates="service_requests")
    service = relationship("Service", back_populates="requests")


class ServiceStatus(Base):
    __tablename__ = "service_status"

    id = Column(Integer, primary_key=True, index=True)
    service_id = Column(String(8), ForeignKey("services.id"))
    check_time = Column(DateTime, nullable=False)
    is_active = Column(Boolean, nullable=False)
    response_time = Column(Float, nullable=True)
    error_message = Column(String, nullable=True)
    details = Column(String, nullable=True)
    retry_count = Column(Integer, default=0)
