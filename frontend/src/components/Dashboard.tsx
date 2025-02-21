import React, { useState, useEffect } from 'react';
import axios from '../api/axios';
import { useNavigate } from 'react-router-dom';

interface Service {
    id: string;
    name: string;
    description: string;
    ip: string;
    port: number;
    nginx_url?: string;
    show_info: boolean;
}

interface ServiceStatus {
    access: 'available' | 'unavailable';
    running: 'online' | 'offline';
}

const Dashboard = () => {
    const navigate = useNavigate();
    const [services, setServices] = useState<Service[]>([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [servicesStatus, setServicesStatus] = useState<{[key: string]: ServiceStatus}>({});
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            navigate('/login');
            return;
        }
        
        const initializeDashboard = async () => {
            await checkAdminStatus();
            await fetchServices();
            await fetchServicesStatus();
            setLoading(false);
        };

        initializeDashboard();

        // 상태 주기적 업데이트
        const statusInterval = setInterval(fetchServicesStatus, 30000);

        // 서비스 권한 업데이트 이벤트 리스너 추가
        const handlePermissionsUpdate = async () => {
            await checkAdminStatus();  // admin 상태 체크
            await fetchServices();     // 서비스 목록 새로고침
            await fetchServicesStatus(); // 서비스 상태 업데이트
        };

        window.addEventListener('servicePermissionsUpdated', handlePermissionsUpdate);

        // 컴포넌트 언마운트 시 이벤트 리스너 제거
        return () => {
            clearInterval(statusInterval);
            window.removeEventListener('servicePermissionsUpdated', handlePermissionsUpdate);
        };
    }, [navigate]);

    const checkAdminStatus = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get('/verify-token', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setIsAdmin(response.data.is_admin);
        } catch (err) {
            console.error('Failed to verify admin status:', err);
            localStorage.removeItem('token');
            navigate('/login');
        }
    };

    const fetchServices = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                navigate('/login');
                return;
            }

            // 먼저 admin 상태 확인
            const admin_response = await axios.get('/verify-token', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const isAdminStatus = admin_response.data.is_admin;
            setIsAdmin(isAdminStatus);

            // admin 상태에 따른 엔드포인트 결정
            const endpoint = isAdminStatus ? '/services' : '/services/my-approved-services';
            const response = await axios.get(endpoint, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (response.data) {
                console.log('Admin Status:', isAdminStatus);
                console.log('Services:', response.data);
                setServices(response.data);
                setError('');
            }
        } catch (err: any) {
            console.error('Error fetching services:', err);
            if (err.response?.status === 401) {
                localStorage.removeItem('token');
                navigate('/login');
            } else {
                setError('서비스 목록을 불러오는데 실패했습니다.');
            }
        }
    };

    const fetchServicesStatus = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            const response = await axios.get('/services/status', {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (response.data) {
                setServicesStatus(response.data);
            }
        } catch (err) {
            console.error('Failed to fetch services status:', err);
        }
    };

    const handleServiceClick = (service: Service) => {
        const status = servicesStatus[service.id];
        if (!status || status.access === 'unavailable') {
            alert('이 서비스에 대한 접근 권한이 없습니다.');
            return;
        }

        const url = service.nginx_url ? service.nginx_url : `/api/${service.id}/`;
        const token = localStorage.getItem('token');
        
        const newWindow = window.open('', '_blank');
        if (newWindow) {
            newWindow.document.write(`
                <html>
                <head>
                    <title>Redirecting...</title>
                    <script>
                        localStorage.setItem('token', '${token}');
                        window.location.href = '${process.env.REACT_APP_NGINX_URL}${url}';
                    </script>
                </head>
                <body>
                    <p>서비스로 이동중...</p>
                </body>
                </html>
            `);
            newWindow.document.close();
        }
    };

    const getStatusIndicator = (serviceId: string) => {
        const status = servicesStatus[serviceId];
        if (!status) return null;

        const getStatusColor = () => {
            if (status.access === 'unavailable') return 'bg-red-500';
            return status.running === 'online' ? 'bg-green-500' : 'bg-yellow-500';
        };

        const getStatusText = () => {
            if (status.access === 'unavailable') return '접근 불가';
            return status.running === 'online' ? '정상 작동' : '서비스 중단';
        };

        return (
            <div className="flex items-center">
                <div className={`w-3 h-3 rounded-full ${getStatusColor()} mr-2`}></div>
                <span className="text-sm text-gray-600">{getStatusText()}</span>
            </div>
        );
    };

    const AdminServiceTable = ({ 
        services, 
        onDelete, 
        servicesStatus 
    }: { 
        services: Service[], 
        onDelete: (ids: string[]) => void,
        servicesStatus: {[key: string]: ServiceStatus}
    }) => {
        const [selectedServices, setSelectedServices] = useState<string[]>([]);
        const [selectAll, setSelectAll] = useState(false);

        const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
            if (e.target.checked) {
                setSelectedServices(services.map(service => service.id));
                setSelectAll(true);
            } else {
                setSelectedServices([]);
                setSelectAll(false);
            }
        };

        const handleSelect = (serviceId: string) => {
            setSelectedServices(prev => {
                if (prev.includes(serviceId)) {
                    return prev.filter(id => id !== serviceId);
                } else {
                    return [...prev, serviceId];
                }
            });
        };

        const handleDelete = () => {
            if (window.confirm('선택한 서비스를 삭제하시겠습니까?')) {
                onDelete(selectedServices);
                setSelectedServices([]);
                setSelectAll(false);
            }
        };

        return (
            <div className="overflow-x-auto">
                <div className="mb-4 flex justify-between items-center">
                    <h2 className="text-xl font-bold">서비스 관리</h2>
                    {selectedServices.length > 0 && (
                        <button
                            onClick={handleDelete}
                            className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
                        >
                            선택 삭제 ({selectedServices.length})
                        </button>
                    )}
                </div>
                <table className="min-w-full bg-white">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="w-12 px-4 py-2">
                                <input
                                    type="checkbox"
                                    checked={selectAll}
                                    onChange={handleSelectAll}
                                    className="rounded"
                                />
                            </th>
                            <th className="px-4 py-2 text-left">이름</th>
                            <th className="px-4 py-2 text-left">설명</th>
                            <th className="px-4 py-2 text-left">IP</th>
                            <th className="px-4 py-2 text-left">Port</th>
                            <th className="px-4 py-2 text-left">상태</th>
                            <th className="px-4 py-2 text-left">접속</th>
                            <th className="px-4 py-2 text-left">작업</th>
                        </tr>
                    </thead>
                    <tbody>
                        {services.map((service) => (
                            <tr key={service.id} className="border-b hover:bg-gray-50">
                                <td className="px-4 py-2">
                                    <input
                                        type="checkbox"
                                        checked={selectedServices.includes(service.id)}
                                        onChange={() => handleSelect(service.id)}
                                        className="rounded"
                                    />
                                </td>
                                <td className="px-4 py-2">{service.name}</td>
                                <td className="px-4 py-2">{service.description}</td>
                                <td className="px-4 py-2">{service.ip}</td>
                                <td className="px-4 py-2">{service.port}</td>
                                <td className="px-4 py-2">
                                    {getStatusIndicator(service.id)}
                                </td>
                                <td className="px-4 py-2">
                                    <button
                                        onClick={() => handleServiceClick(service)}
                                        className="text-blue-500 hover:text-blue-700"
                                        disabled={!servicesStatus[service.id] || servicesStatus[service.id].running === 'offline'}
                                    >
                                        {servicesStatus[service.id]?.running === 'online' ? '접속하기' : '접속불가'}
                                    </button>
                                </td>
                                <td className="px-4 py-2">
                                    <button
                                        onClick={() => onDelete([service.id])}
                                        className="text-red-500 hover:text-red-700"
                                    >
                                        삭제
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    const deleteServices = async (serviceIds: string[]) => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            await Promise.all(
                serviceIds.map(id =>
                    axios.delete(`/services/${id}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    })
                )
            );

            // 서비스 목록 새로고침
            await fetchServices();
            
        } catch (err) {
            console.error('Failed to delete services:', err);
            setError('서비스 삭제 중 오류가 발생했습니다.');
        }
    };

    return (
        <div className="container mx-auto p-4">
            {error && (
                <div className="mb-4 p-3 bg-red-100 text-red-600 rounded">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                </div>
            ) : (
                <>
                    {isAdmin ? (
                        <AdminServiceTable 
                            services={services} 
                            onDelete={deleteServices}
                            servicesStatus={servicesStatus}
                        />
                    ) : (
                        <>
                            <h2 className="text-2xl font-bold mb-6">
                                내가 접근 가능한 서비스 목록
                            </h2>
                            {/* 검색 필드 */}
                            <div className="mb-6">
                                <input
                                    type="text"
                                    placeholder="서비스 검색..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full p-2 border rounded"
                                />
                            </div>

                            {/* 서비스 목록 */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {services.length > 0 ? (
                                    services
                                        .filter(service => {
                                            const searchLower = searchTerm.toLowerCase();
                                            return (
                                                service.name.toLowerCase().includes(searchLower) ||
                                                service.description?.toLowerCase().includes(searchLower) ||
                                                (isAdmin && service.ip.toLowerCase().includes(searchLower)) ||
                                                (isAdmin && service.port.toString().includes(searchLower))
                                            );
                                        })
                                        .map((service) => (
                                            <div
                                                key={service.id}
                                                onClick={() => handleServiceClick(service)}
                                                className="bg-white rounded-lg shadow-md p-6 cursor-pointer hover:shadow-lg transition-shadow"
                                            >
                                                <div className="flex justify-between items-start mb-4">
                                                    <h3 className="text-lg font-semibold">{service.name}</h3>
                                                    {getStatusIndicator(service.id)}
                                                </div>
                                                <p className="text-gray-600 mb-4">{service.description}</p>
                                                {(isAdmin || service.show_info) && (
                                                    <div className="text-sm text-gray-500">
                                                        {service.ip}:{service.port}
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                ) : (
                                    <div className="col-span-3 text-center text-gray-500 py-8">
                                        서비스가 없습니다.
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </>
            )}
        </div>
    );
};

export default Dashboard; 