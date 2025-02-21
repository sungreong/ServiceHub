import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface ServiceListProps {
  // props 타입 정의
}

export const ServiceList: React.FC<ServiceListProps> = () => {
  const [error, setError] = useState<string>('');

  const handleError = (err: any) => {
    const errorMessage = err.response?.data?.detail || "알 수 없는 오류가 발생했습니다.";
    if (typeof errorMessage === 'object') {
      // 객체인 경우 메시지 추출
      setError(errorMessage.msg || JSON.stringify(errorMessage));
    } else {
      // 문자열인 경우 직접 사용
      setError(errorMessage);
    }
  };

  // JSX 반환 추가
  return (
    <div>
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
      {/* 나머지 컴포넌트 UI */}
    </div>
  );
}; 