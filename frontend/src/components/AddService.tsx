import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axios';

const AddService = () => {
    const [name, setName] = useState('');
    const [ip, setIp] = useState('');
    const [port, setPort] = useState('');
    const [description, setDescription] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const response = await axios.post('/services', {
                name,
                ip,
                port: parseInt(port),
                description,
            });
            if (response.data && response.data.nginxUpdated) {
                setSuccess(`서비스가 등록되었으며 Nginx 구성 업데이트 완료되었습니다. API 접근 경로: ${process.env.REACT_APP_NGINX_URL}${response.data.nginx_url}`);
            } else {
                setSuccess(`서비스 등록은 성공했지만 Nginx 구성 업데이트에 문제가 발생했습니다. API 접근 경로: ${process.env.REACT_APP_NGINX_URL}${response.data.nginx_url || "알 수 없음"}`);
            }
            setTimeout(() => {
                navigate('/dashboard');
            }, 2000);
        } catch (err) {
            setError('서비스 등록에 실패했습니다.');
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