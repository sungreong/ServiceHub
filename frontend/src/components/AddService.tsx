import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axios';

const AddService = () => {
    const [name, setName] = useState('');
    const [protocol, setProtocol] = useState('http');
    const [ip, setIp] = useState('');
    const [port, setPort] = useState('');
    const [description, setDescription] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        try {
            const response = await axios.post('/services', {
                name,
                protocol,
                ip,
                port: parseInt(port),
                description,
            });

            const serviceData = response.data;
            
            setSuccess(
                `서비스가 성공적으로 등록되었습니다.\n` +
                `API 접근 경로: ${process.env.REACT_APP_NGINX_URL}${serviceData.nginx_url}`
            );

            setTimeout(() => {
                navigate('/dashboard');
            }, 2000);

        } catch (err: any) {
            const errorMessage = err.response?.data?.detail || '서비스 등록에 실패했습니다.';
            setError(errorMessage);
        }
    };

    return (
        <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold mb-6">새 서비스 추가</h2>
            {error && (
                <div className="mb-4 p-3 bg-red-100 text-red-600 rounded">
                    {error}
                </div>
            )}
            {success && (
                <div className="mb-4 p-3 bg-green-100 text-green-600 rounded">
                    {success}
                </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        서비스 이름
                    </label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="input-field"
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        프로토콜
                    </label>
                    <select
                        value={protocol}
                        onChange={(e) => setProtocol(e.target.value)}
                        className="input-field"
                        required
                    >
                        <option value="http">HTTP</option>
                        <option value="https">HTTPS</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        IP 주소
                    </label>
                    <input
                        type="text"
                        value={ip}
                        onChange={(e) => setIp(e.target.value)}
                        className="input-field"
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        포트
                    </label>
                    <input
                        type="number"
                        value={port}
                        onChange={(e) => setPort(e.target.value)}
                        className="input-field"
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        설명
                    </label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="input-field"
                        rows={4}
                    />
                </div>
                <button type="submit" className="btn-primary w-full">
                    서비스 등록
                </button>
            </form>
        </div>
    );
};

export default AddService; 