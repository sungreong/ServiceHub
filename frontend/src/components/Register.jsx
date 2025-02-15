import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const Register = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!email.endsWith(`@${process.env.REACT_APP_ALLOWED_DOMAIN}`)) {
            setError(`${process.env.REACT_APP_ALLOWED_DOMAIN} 도메인의 이메일만 사용 가능합니다.`);
            return;
        }

        try {
            await axios.post('http://localhost:8000/register', {
                email,
                password,
            });
            navigate('/login');
        } catch (err) {
            setError('회원가입에 실패했습니다.');
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-lg shadow-md">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                        회원가입
                    </h2>
                    {error && (
                        <div className="mt-2 text-center text-sm text-red-600">
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
                            />
                        </div>
                    </div>
                    <div>
                        <button type="submit" className="btn-primary w-full">
                            회원가입
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Register; 