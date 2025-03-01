import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSessionId, recordServiceAccess } from '../../api/monitoring';

interface ServiceCardProps {
  id: string;
  name: string;
  description: string;
  icon?: string;
  status: string;
  onClick?: (id: string) => void;
}

const ServiceCard: React.FC<ServiceCardProps> = ({ 
  id, 
  name, 
  description, 
  icon = '🔗', 
  status,
  onClick 
}) => {
  const navigate = useNavigate();
  const [isRecording, setIsRecording] = useState(false);

  const handleClick = async () => {
    console.log(`[서비스 카드] '${name}' 서비스 카드 클릭됨, ID: ${id}`);
    
    if (onClick) {
      // 상위 컴포넌트에서 제공한 onClick 핸들러가 있으면 호출
      onClick(id);
      return;
    }
    
    if (isRecording) {
      console.log(`[서비스 카드] '${name}' 서비스 접근 기록 중복 방지`);
      return;
    }
    
    try {
      setIsRecording(true);
      console.log(`[서비스 카드] '${name}' 서비스 접근 기록 시작`);
      const sessionId = getSessionId();
      console.log(`[서비스 카드] 세션 ID: ${sessionId}`);
      
      const result = await recordServiceAccess(id, sessionId);
      console.log(`[서비스 카드] 서비스 접근 기록 결과:`, result);
      
      // 접근 기록 완료 후 서비스 페이지로 이동
      navigate(`/service/${id}`);
    } catch (error) {
      console.error(`[서비스 카드] '${name}' 서비스 접근 기록 중 오류:`, error);
    } finally {
      setIsRecording(false);
    }
  };

  return (
    <div 
      className={`service-card ${status === 'running' ? 'active' : 'inactive'}`}
      onClick={handleClick}
    >
      <div className="service-icon">{icon}</div>
      <div className="service-content">
        <h3>{name}</h3>
        <p>{description}</p>
        <div className={`service-status ${status === 'running' ? 'status-running' : 'status-stopped'}`}>
          {status === 'running' ? '운영 중' : '중지됨'}
        </div>
      </div>
    </div>
  );
};

export default ServiceCard; 