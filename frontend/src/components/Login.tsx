import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from '../api/axios';  // 상대 경로 수정

type ErrorType = {
    type?: string;
    message: string;
    registration_date?: string;
} | null;

const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<ErrorType>(null);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    // 쿠키 값을 가져오는 헬퍼 함수
    const getCookie = (name: string): string | null => {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
        return null;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            console.log('[DEBUG] 로그인 시도:', { email });
            
            // 환경 변수 확인
            const allowedDomain = process.env.REACT_APP_ALLOWED_DOMAIN || 'gmail.com';
            console.log('[DEBUG] 허용된 도메인:', allowedDomain);
            
            if (!email.endsWith(`@${allowedDomain}`)) {
                throw new Error(`@${allowedDomain} 도메인의 이메일만 사용 가능합니다.`);
            }
            
            // API 요청 직전에 URL 확인
            console.log('[DEBUG] 요청 전 백엔드 URL 확인:', axios.defaults.baseURL);
            
            console.log('[DEBUG] 로그인 요청 데이터:', { 
                email, 
                password: password ? '********' : '비밀번호 없음' 
            });
            
            // 명시적으로 전체 URL 설정
            const loginEndpoint = `${axios.defaults.baseURL}/login`;
            console.log('[DEBUG] 로그인 엔드포인트:', loginEndpoint);
            
            const response = await axios.post("/login", { email, password });
            
            console.log('[DEBUG] 로그인 성공 응답:', response.status, response.data);
            
            // 토큰 저장
            if (response.data.access_token) {
                localStorage.setItem("token", response.data.access_token);
                console.log('[DEBUG] 토큰이 로컬스토리지에 저장됨');
                
                // 사용자 정보 로컬스토리지에 저장
                if (response.data.user_id) {
                    localStorage.setItem("user_id", response.data.user_id);
                }
                if (response.data.is_admin !== undefined) {
                    localStorage.setItem("is_admin", response.data.is_admin.toString());
                }
                if (response.data.email) {
                    localStorage.setItem("user_email", response.data.email);
                }
                
                // 쿠키 확인
                const tokenCookie = getCookie('token');
                const userIdCookie = getCookie('user_id');
                const isAdminCookie = getCookie('is_admin');
                
                console.log('[DEBUG] 쿠키 상태:', {
                    token: tokenCookie ? '존재함' : '없음',
                    user_id: userIdCookie,
                    is_admin: isAdminCookie
                });
                
                navigate("/dashboard");
            } else {
                console.error('[ERROR] 응답에 토큰이 없습니다:', response.data);
                setError({ message: "로그인 성공했으나 인증 토큰이 없습니다." });
            }
        } catch (error: any) {
            console.error('[ERROR] 로그인 오류:', error.message);
            
            // 네트워크 오류 상세 정보
            if (error.message === 'Network Error') {
                console.error('[ERROR] 네트워크 오류 발생 - 서버에 연결할 수 없습니다');
                console.error('[ERROR] API 기본 URL:', axios.defaults.baseURL);
                console.error('[ERROR] withCredentials 설정:', axios.defaults.withCredentials);
            }
            
            if (error.response) {
                // 서버가 응답한 경우
                console.error('[ERROR] 응답 상태:', error.response.status);
                console.error('[ERROR] 응답 데이터:', error.response.data);
                
                if (error.response.data.detail && typeof error.response.data.detail === 'object') {
                    setError(error.response.data.detail);
                } else {
                    setError({ message: error.response.data.detail || "로그인에 실패했습니다. 올바른 계정 정보를 입력해주세요." });
                }
            } else if (error.request) {
                // 요청은 전송되었으나 응답이 없는 경우
                console.error('[ERROR] 요청 정보:', error.request);
                setError({ message: "서버 응답이 없습니다. 서버 상태를 확인해주세요." });
            } else {
                // 요청 설정 과정에서 오류가 발생한 경우
                setError({ message: error.message || "로그인 중 오류가 발생했습니다." });
            }
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = () => {
        navigate('/register');
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                        계정에 로그인하세요
                    </h2>
                </div>
                <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                    <div className="rounded-md shadow-sm -space-y-px">
                        <div>
                            <label htmlFor="email-address" className="sr-only">
                                이메일 주소
                            </label>
                            <input
                                id="email-address"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                                placeholder="이메일 주소"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div>
                            <label htmlFor="password" className="sr-only">
                                비밀번호
                            </label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                autoComplete="current-password"
                                required
                                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                                placeholder="비밀번호"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    {error && (
                        <div className={`rounded-md ${
                            error.type === 'pending_approval' ? 'bg-yellow-50' : 'bg-red-50'
                        } p-4`}>
                            <div className="flex">
                                <div className="ml-3">
                                    <h3 className="text-sm font-medium text-red-800">{error.message}</h3>
                                    {error.type === 'pending_approval' && error.registration_date && (
                                        <p className="mt-1 text-xs text-red-700">
                                            가입 신청일: {new Date(error.registration_date).toLocaleString()}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    <div>
                        <button
                            type="submit"
                            disabled={loading}
                            className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white ${
                                loading ? 'bg-indigo-400' : 'bg-indigo-600 hover:bg-indigo-700'
                            } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500`}
                        >
                            {loading ? '로그인 중...' : '로그인'}
                        </button>
                    </div>
                    
                    {error?.type === 'not_found' && (
                        <div className="text-center">
                            <button
                                type="button"
                                onClick={handleRegister}
                                className="text-sm text-indigo-600 hover:text-indigo-500"
                            >
                                회원가입 하기
                            </button>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
};

export default Login; 