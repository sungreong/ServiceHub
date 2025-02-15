import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from '../api/axios';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            if (!email.endsWith(`@${process.env.REACT_APP_ALLOWED_DOMAIN}`)) {
                throw new Error(`${process.env.REACT_APP_ALLOWED_DOMAIN} 도메인의 이메일만 사용 가능합니다.`);
            }

            const response = await axios.post('/login', {
                email,
                password,
            });

            localStorage.setItem('token', response.data.access_token);
            
            // 관리자 여부는 토큰 검증 후 결정
            navigate('/dashboard');  // 일단 dashboard로 이동
            
        } catch (err) {
            console.error('Login error:', err);
            setError(
                err.response?.data?.detail || 
                err.message || 
                '로그인에 실패했습니다.'
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-lg shadow-md">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                        로그인
                    </h2>
                    {error && (
                        <div className="mt-2 p-2 bg-red-100 text-red-600 text-sm rounded">
                            {error}
                        </div>
                    )}
                </div>
                <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                    <div className="rounded-md shadow-sm -space-y-px">
                        <div className="mb-4">
                            <label className="block text-gray-700 text-sm font-bold mb-2">
                                이메일
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="input-field"
                                placeholder={`example@${process.env.REACT_APP_ALLOWED_DOMAIN}`}
                                disabled={loading}
                            />
                        </div>
                        <div className="mb-4">
                            <label className="block text-gray-700 text-sm font-bold mb-2">
                                비밀번호
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="input-field"
                                placeholder="비밀번호를 입력하세요"
                                disabled={loading}
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="text-sm">
                            <Link 
                                to="/register" 
                                className="font-medium text-indigo-600 hover:text-indigo-500"
                            >
                                계정이 없으신가요? 회원가입
                            </Link>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
                            loading ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                    >
                        {loading ? (
                            <span className="flex items-center">
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                로그인 중...
                            </span>
                        ) : (
                            '로그인'
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Login; 