import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from '../api/axios';  // 상대 경로 수정

const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<{
        type?: string;
        message: string;
        registration_date?: string;
    } | null>(null);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            if (!email.endsWith(`@${process.env.REACT_APP_ALLOWED_DOMAIN}`)) {
                throw new Error(`${process.env.REACT_APP_ALLOWED_DOMAIN} 도메인의 이메일만 사용 가능합니다.`);
            }

            const response = await axios.post('/login', {
                email,
                password
            });
            
            localStorage.setItem('token', response.data.access_token);
            navigate('/dashboard');
        } catch (err: any) {
            console.error('Login error:', err);
            const detail = err.response?.data?.detail;
            setError(detail || { message: err.message || '로그인에 실패했습니다.' });
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = () => {
        navigate('/register');
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
                <div>
                    <h2 className="text-center text-3xl font-extrabold text-gray-900">
                        Service Portal
                    </h2>
                </div>

                <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                    <div className="rounded-md shadow-sm -space-y-px">
                        <div>
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                                placeholder={`이메일 (@${process.env.REACT_APP_ALLOWED_DOMAIN})`}
                            />
                        </div>
                        <div>
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                                placeholder="비밀번호"
                            />
                        </div>
                    </div>

                    {error && (
                        <div className={`p-4 rounded ${
                            error.type === 'pending_approval' ? 'bg-yellow-100' : 'bg-red-100'
                        }`}>
                            <p className="text-sm">
                                {error.message}
                                {error.type === 'pending_approval' && error.registration_date && (
                                    <span className="block mt-1 text-xs">
                                        가입 신청일: {new Date(error.registration_date).toLocaleString()}
                                    </span>
                                )}
                            </p>
                        </div>
                    )}

                    <div className="flex items-center justify-between">
                        <button
                            type="submit"
                            className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                            로그인
                        </button>
                    </div>

                    {error?.type === 'not_found' && (
                        <div className="text-center">
                            <button
                                type="button"
                                onClick={handleRegister}
                                className="text-sm text-blue-600 hover:text-blue-500"
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