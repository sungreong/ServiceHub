import React, { useState, useEffect } from 'react';
import axios from '../api/axios';

const Dashboard = () => {
    const [services, setServices] = useState([]);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchServices = async () => {
            try {
                const response = await axios.get('/services');
                setServices(response.data);
            } catch (err) {
                setError('서비스 목록을 불러오는데 실패했습니다.');
            }
        };
        fetchServices();
    }, []);

    const handleServiceClick = (service) => {
        const url = service.nginx_url ? service.nginx_url : `/api/${service.id}/`;
        window.location.href = `${process.env.REACT_APP_NGINX_URL}${url}`;
    };

    return (
        <div className="min-h-screen bg-gray-100 py-6 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">
                <h2 className="text-3xl font-bold text-gray-900 mb-6">
                    사용 가능한 API 서비스
                </h2>
                {error && (
                    <div className="mb-4 text-sm text-red-600 bg-red-100 p-3 rounded">
                        {error}
                    </div>
                )}
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {services.map((service) => (
                        <div
                            key={service.id}
                            onClick={() => handleServiceClick(service)}
                            className="bg-white overflow-hidden shadow rounded-lg cursor-pointer transition-all duration-200 hover:shadow-lg"
                        >
                            <div className="px-4 py-5 sm:p-6">
                                <h3 className="text-lg font-medium text-gray-900 mb-2">
                                    {service.name}
                                </h3>
                                <p className="text-sm text-gray-500 mb-4">
                                    {service.description}
                                </p>
                                <div className="text-sm text-gray-600">
                                    {service.ip}:{service.port}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default Dashboard; 