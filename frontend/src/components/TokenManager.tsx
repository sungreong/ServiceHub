import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaSync } from 'react-icons/fa';
import instance from '../api/axios';

interface TokenManagerProps {
  className?: string;
}

/**
 * 토큰 인증 및 갱신을 관리하는 컴포넌트
 * @param className 컴포넌트에 적용할 CSS 클래스
 */
const TokenManager: React.FC<TokenManagerProps> = ({ className = '' }) => {
  const navigate = useNavigate();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleTokenRefresh = async () => {
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        alert('리프레시 토큰이 없습니다. 다시 로그인해주세요.');
        navigate('/login');
        return;
      }
      
      // 버튼 상태 변경
      const button = document.getElementById('token-refresh-button');
      if (button) {
        button.innerHTML = '<span class="animate-spin inline-block mr-2">⟳</span> 갱신 중...';
        button.setAttribute('disabled', 'true');
      }
      
      // 토큰 갱신 시도
      console.log('[DEBUG] 토큰 갱신 요청 시작');
      
      // 다양한 방식으로 시도
      let response;
      try {
        // 1. JSON 형식으로 시도
        response = await instance.post('/refresh-token', { refresh_token: refreshToken });
      } catch (jsonError) {
        try {
          // 2. 텍스트 형식으로 시도
          response = await instance.post('/refresh-token', refreshToken, {
            headers: { 'Content-Type': 'text/plain' }
          });
        } catch (textError) {
          try {
            // 3. URL 인코딩 형식으로 시도
            response = await instance.post('/refresh-token', 
              `refresh_token=${encodeURIComponent(refreshToken)}`, {
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
          } catch (formError) {
            // 4. 쿼리 파라미터 방식 시도
            response = await instance.post(`/refresh-token?refresh_token=${encodeURIComponent(refreshToken)}`);
          }
        }
      }
      
      if (!response || !response.data) {
        throw new Error('토큰 갱신 응답에 데이터가 없습니다.');
      }
      
      // 토큰 추출
      let accessToken;
      if (response.data.access_token) {
        accessToken = response.data.access_token;
      } else if (typeof response.data === 'string') {
        if (response.data.includes('access_token')) {
          try {
            const jsonData = JSON.parse(response.data);
            accessToken = jsonData.access_token;
          } catch (e) {
            // 문자열에서 액세스 토큰 추출 시도
            const match = response.data.match(/access_token[\"'\s:=]+([^\"'\s,}]+)/);
            if (match && match[1]) {
              accessToken = match[1];
            }
          }
        } else if (response.data.startsWith('eyJ')) {
          // 응답이 직접 JWT 토큰인 경우
          accessToken = response.data;
        }
      }
      
      if (!accessToken) {
        throw new Error('액세스 토큰을 찾을 수 없습니다');
      }
      
      // 토큰 저장
      localStorage.setItem('token', accessToken);
      
      // 쿠키에도 저장 (백엔드에서 쿠키로도 토큰을 찾을 수 있도록)
      document.cookie = `access_token=${accessToken}; path=/; max-age=3600;`;
      
      // HTTP-only 쿠키 설정 시도 (백엔드에서 이 엔드포인트를 지원하는 경우에만)
      // 서버는 이 요청을 받아 HTTP-only 쿠키를 설정할 수 있음
      const enableHttpOnlyCookie = process.env.REACT_APP_ENABLE_HTTP_ONLY_COOKIE === 'true';
      if (enableHttpOnlyCookie) {
        try {
          await instance.post('/set-auth-cookie', { access_token: accessToken });
          console.log('[인증] HTTP-only 쿠키 설정 성공');
        } catch (err) {
          console.warn('[인증] HTTP-only 쿠키 설정 실패 (서버에서 지원하지 않을 수 있음):', err);
        }
      } else {
        console.log('[인증] HTTP-only 쿠키 설정 비활성화됨');
      }
      
      console.log('[DEBUG] 새 액세스 토큰 저장 완료');
      
      // 성공 표시
      if (button) {
        button.innerHTML = '<svg class="mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> 토큰 갱신됨';
        button.className = `${className} flex items-center bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-sm`;
        
        // 2초 후 원래 상태로 복원
        setTimeout(() => {
          setIsRefreshing(false);
          if (button) {
            button.innerHTML = '<svg class="mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> 토큰 갱신';
            button.className = `${className} flex items-center bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded text-sm`;
            button.removeAttribute('disabled');
          }
        }, 2000);
      }
      
      // 성공 메시지
      alert('토큰이 성공적으로 갱신되었습니다.');
      
      // 페이지 새로고침 (데이터 다시 로딩)
      window.location.reload();
      
    } catch (error) {
      console.error('토큰 갱신 실패:', error);
      setIsRefreshing(false);
      
      // 버튼 상태 복원
      const button = document.getElementById('token-refresh-button');
      if (button) {
        button.innerHTML = '<svg class="mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> 토큰 갱신';
        button.className = `${className} flex items-center bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm`;
        button.removeAttribute('disabled');
      }
      
      alert('토큰 갱신에 실패했습니다. 다시 로그인해주세요.');
      
      // 로그인 페이지로 이동
      navigate('/login');
    }
  };

  return (
    <button
      id="token-refresh-button"
      onClick={handleTokenRefresh}
      className={`${className} flex items-center bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded text-sm`}
      title="토큰 갱신"
      disabled={isRefreshing}
    >
      {isRefreshing ? (
        <>
          <span className="animate-spin inline-block mr-2">⟳</span> 갱신 중...
        </>
      ) : (
        <>
          <FaSync className="mr-1" /> 토큰 갱신
        </>
      )}
    </button>
  );
};

export default TokenManager; 