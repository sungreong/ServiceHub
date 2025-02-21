import React, { useState, useEffect } from 'react';
import axios from '../api/axios';

interface User {
    id: number;
    email: string;
    is_admin: boolean;
}

interface Service {
    id: number;
    name: string;
    description: string;
}

const ServiceUserManagement = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [selectedUser, setSelectedUser] = useState<number | null>(null);
    const [allServices, setAllServices] = useState<Service[]>([]);
    const [allowedServices, setAllowedServices] = useState<Service[]>([]);
    const [selectedServices, setSelectedServices] = useState<number[]>([]);
    const [error, setError] = useState('');
    const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    useEffect(() => {
        fetchUsers();
        fetchAllServices();
    }, []);

    useEffect(() => {
        if (selectedUser) {
            fetchUserAllowedServices(selectedUser);
        }
    }, [selectedUser]);

    const fetchUsers = async () => {
        try {
            const response = await axios.get('/users');
            setUsers(response.data.filter((user: User) => !user.is_admin)); // 관리자 제외
        } catch (err) {
            setError('사용자 목록을 불러오는데 실패했습니다.');
        }
    };

    const fetchAllServices = async () => {
        try {
            const response = await axios.get('/services');
            setAllServices(response.data);
        } catch (err) {
            setError('서비스 목록을 불러오는데 실패했습니다.');
        }
    };

    const fetchUserAllowedServices = async (userId: number) => {
        try {
            const response = await axios.get(`/users/${userId}/allowed-services`);
            setAllowedServices(response.data);
            // 현재 허용된 서비스 ID들로 selectedServices 초기화
            setSelectedServices(response.data.map((service: Service) => service.id));
        } catch (err) {
            setError('허용된 서비스 목록을 불러오는데 실패했습니다.');
        }
    };

    const handleServicePermissionUpdate = async () => {
        if (!selectedUser) return;

        try {
            const response = await axios.post(`/users/${selectedUser}/service-permissions`, {
                service_ids: selectedServices
            });

            if (response.data.added.length > 0) {
                setMessage({
                    type: 'success',
                    text: `추가된 서비스: ${response.data.added.join(', ')}`
                });
            }
            if (response.data.removed.length > 0) {
                setMessage({
                    type: 'info',
                    text: `제거된 서비스: ${response.data.removed.join(', ')}`
                });
            }
            if (response.data.not_found.length > 0) {
                setMessage({
                    type: 'warning',
                    text: `찾을 수 없는 서비스 ID: ${response.data.not_found.join(', ')}`
                });
            }

            // 권한 목록 새로고침
            await fetchUserAllowedServices(selectedUser);
            
            // 실시간 업데이트를 위한 이벤트 발생
            window.dispatchEvent(new CustomEvent('servicePermissionsUpdated', {
                detail: { userId: selectedUser }
            }));

            setRefreshTrigger(prev => prev + 1);  // 새로고침 트리거
        } catch (err) {
            setError('서비스 권한 업데이트에 실패했습니다.');
            console.error('Failed to update service permissions:', err);
        }
    };

    return (
        <div className="container mx-auto p-4">
            <h2 className="text-2xl font-bold mb-6">사용자별 서비스 권한 관리</h2>

            {error && (
                <div className="mb-4 p-3 bg-red-100 text-red-600 rounded">
                    {error}
                </div>
            )}
            {message && (
                <div className={`mb-4 p-3 rounded ${
                    message.type === 'success' ? 'bg-green-100 text-green-600' : message.type === 'info' ? 'bg-blue-100 text-blue-600' : 'bg-yellow-100 text-yellow-600'
                }`}>
                    {message.text.split('\n').map((line, i) => (
                        <p key={i}>{line}</p>
                    ))}
                </div>
            )}

            {/* 사용자 선택 */}
            <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    사용자 선택
                </label>
                <select
                    value={selectedUser || ''}
                    onChange={(e) => setSelectedUser(Number(e.target.value))}
                    className="w-full p-2 border rounded"
                >
                    <option value="">사용자를 선택하세요</option>
                    {users.map((user) => (
                        <option key={user.id} value={user.id}>
                            {user.email}
                        </option>
                    ))}
                </select>
            </div>

            {selectedUser && (
                <div className="space-y-6">
                    {/* 서비스 선택 */}
                    <div className="bg-white p-6 rounded-lg shadow">
                        <h3 className="text-lg font-semibold mb-4">서비스 권한 설정</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {allServices.map(service => (
                                <label key={service.id} className="flex items-start p-3 border rounded hover:bg-gray-50">
                                    <input
                                        type="checkbox"
                                        checked={selectedServices.includes(service.id)}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelectedServices([...selectedServices, service.id]);
                                            } else {
                                                setSelectedServices(selectedServices.filter(id => id !== service.id));
                                            }
                                        }}
                                        className="mt-1 mr-3"
                                    />
                                    <div>
                                        <div className="font-medium">{service.name}</div>
                                        <div className="text-sm text-gray-500">{service.description}</div>
                                    </div>
                                </label>
                            ))}
                        </div>
                        <button
                            onClick={handleServicePermissionUpdate}
                            className="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                        >
                            권한 설정 저장
                        </button>
                    </div>

                    {/* 현재 허용된 서비스 목록 */}
                    <div className="bg-white p-6 rounded-lg shadow">
                        <h3 className="text-lg font-semibold mb-4">현재 허용된 서비스</h3>
                        {allowedServices.length > 0 ? (
                            <ul className="space-y-2">
                                {allowedServices.map(service => (
                                    <li key={service.id} className="flex items-center justify-between p-2 border-b">
                                        <span>{service.name}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-gray-500">허용된 서비스가 없습니다.</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ServiceUserManagement; 