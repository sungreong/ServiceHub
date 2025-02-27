import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import axios from '../api/axios';
// import logo from '../assets/logo.png';  // 로고 이미지 import

interface User {
    email: string;
    is_admin: boolean;
}

const Layout = ({ children }: { children: React.ReactNode }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const [user, setUser] = useState<User | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [pendingCount, setPendingCount] = useState(0);

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
                setIsAdmin(response.data.is_admin);
            } catch (err) {
                console.error('Token verification failed:', err);
                localStorage.removeItem('token');
                navigate('/login');
            }
        };

        checkToken();
        fetchPendingCount();

        // 30초마다 대기 요청 수 업데이트
        const interval = setInterval(fetchPendingCount, 30000);
        return () => clearInterval(interval);
    }, [navigate]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        navigate('/login');
    };

    const fetchPendingCount = async () => {
        try {
            const response = await axios.get('/services/pending-requests/count');
            setPendingCount(response.data.count);
        } catch (err) {
            console.error('Failed to fetch pending requests count:', err);
        }
    };

    // 사용자 유형에 따른 메뉴 아이템 설정
    const getMenuItems = () => {
        if (user?.is_admin) {
            return [
                { path: '/dashboard', label: '서비스 목록', icon: '📋' },
                { path: '/users', label: '유저 관리', icon: '👥' },
                { path: '/users/bulk-add', label: '유저 일괄 추가', icon: '📥' },
                { path: '/service-requests', label: '서비스 요청 관리', icon: '📨' },
                { path: '/services/bulk-add', label: '서비스 일괄 추가', icon: '📥' },
                { 
                    path: '/pending-requests', 
                    label: `승인 대기 요청${pendingCount > 0 ? ` (${pendingCount})` : ''}`, 
                    icon: '⏳',
                    hasBadge: true 
                },
                { path: '/service-users', label: '서비스별 사용자', icon: '👥' },
                { path: '/service-user-management', label: '서비스 사용자 관리', icon: '👥' },
            ];
        }
        return [
            { path: '/dashboard', label: '서비스 목록', icon: '📋' },
            { 
                path: '/service-requests', 
                label: `서비스 요청${pendingCount > 0 ? ` (${pendingCount})` : ''}`, 
                icon: '📨',
                hasBadge: true 
            },
        ];
    };

    return (
        <div className="flex h-screen bg-gray-100">
            {/* 사이드바 */}
            <div className="w-64 bg-white shadow-lg">
                <nav className="mt-4">
                    {getMenuItems().map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`flex items-center justify-between px-4 py-3 text-gray-700 hover:bg-gray-100 
                                ${location.pathname === item.path ? 'bg-blue-50 text-blue-600' : ''}`}
                        >
                            <div className="flex items-center">
                                <span className="mr-3">{item.icon}</span>
                                <span>{item.label}</span>
                            </div>
                            {item.hasBadge && pendingCount > 0 && (
                                <span className={`px-2 py-1 text-xs rounded-full ${
                                    user?.is_admin ? 'bg-red-500' : 'bg-blue-500'
                                } text-white`}>
                                    {pendingCount}
                                </span>
                            )}
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