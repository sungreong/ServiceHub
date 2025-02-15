import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import axios from '../api/axios';

interface User {
    email: string;
    is_admin: boolean;
}

const Layout = ({ children }: { children: React.ReactNode }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const [user, setUser] = useState<User | null>(null);

    useEffect(() => {
        const checkToken = async () => {
            const token = localStorage.getItem('token');
            if (!token) {
                navigate('/login');
                return;
            }

            try {
                const response = await axios.get('/verify-token');
                setUser({
                    email: response.data.user,
                    is_admin: response.data.is_admin || false
                });
            } catch (err) {
                console.error('Token verification failed:', err);
                localStorage.removeItem('token');
                navigate('/login');
            }
        };

        checkToken();
    }, [navigate]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        navigate('/login');
    };

    // 사용자 유형에 따른 메뉴 아이템 설정
    const getMenuItems = () => {
        if (user?.is_admin) {
            return [
                { path: '/dashboard', label: '서비스 목록', icon: '📋' },
                { path: '/users', label: '유저 관리', icon: '👥' },
                { path: '/users/bulk-add', label: '유저 일괄 추가', icon: '📥' },
                { path: '/service-requests', label: '서비스 요청 관리', icon: '📨' },
                { path: '/services/add', label: '서비스 추가', icon: '➕' },
                { path: '/services/bulk-add', label: '서비스 일괄 추가', icon: '📥' },
                { path: '/pending-requests', label: '승인 대기 요청', icon: '⏳' },
                { path: '/service-users', label: '서비스별 사용자', icon: '👥' },
            ];
        }
        return [
            { path: '/dashboard', label: '서비스 목록', icon: '📋' },
            { path: '/service-requests', label: '서비스 요청', icon: '📨' },
        ];
    };

    return (
        <div className="flex h-screen bg-gray-100">
            {/* 사이드바 */}
            <div className="w-64 bg-white shadow-lg">
                <div className="p-4">
                    <h1 className="text-xl font-bold text-gray-800">Service Portal</h1>
                </div>
                <nav className="mt-4">
                    {getMenuItems().map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`flex items-center px-4 py-3 text-gray-700 hover:bg-gray-100 
                                ${location.pathname === item.path ? 'bg-blue-50 text-blue-600' : ''}`}
                        >
                            <span className="mr-3">{item.icon}</span>
                            {item.label}
                        </Link>
                    ))}
                </nav>
                <div className="absolute bottom-0 w-64 p-4 bg-white border-t">
                    {user && (
                        <div className="mb-2 text-sm text-gray-600">
                            <span className="font-semibold">{user.email}</span>
                            <br />
                            <span className="text-xs">
                                {user.is_admin ? '관리자' : '일반 사용자'}
                            </span>
                        </div>
                    )}
                    <button
                        onClick={handleLogout}
                        className="flex items-center px-4 py-2 text-gray-700 hover:bg-gray-100 w-full rounded"
                    >
                        <span className="mr-3">🚪</span>
                        로그아웃
                    </button>
                </div>
            </div>

            {/* 메인 컨텐츠 */}
            <div className="flex-1 overflow-auto">
                <div className="p-8">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default Layout; 