import React, { useState } from 'react';
import axios from '../api/axios';

const AdminPanel = () => {
    const [name, setName] = useState('');
    const [ip, setIp] = useState('');
    const [port, setPort] = useState('');
    const [description, setDescription] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await axios.post('/services', {
                name,
                ip,
                port: parseInt(port),
                description,
            });
            setSuccess('서비스가 성공적으로 등록되었습니다.');
            setName('');
            setIp('');
            setPort('');
            setDescription('');
            setError('');
        } catch (err) {
            setError('서비스 등록에 실패했습니다.');
            setSuccess('');
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 py-6 px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl mx-auto">
                <h2 className="text-3xl font-bold text-gray-900 mb-6">
                    API 서비스 등록
                </h2>
                {error && (
                    <div className="mb-4 text-sm text-red-600 bg-red-100 p-3 rounded">
                        {error}
                    </div>
                )}
                {success && (
                    <div className="mb-4 text-sm text-green-600 bg-green-100 p-3 rounded">
                        {success}
                    </div>
                )}
                <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg shadow">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">
                            서비스 이름
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            className="input-field"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">
                            IP 주소
                        </label>
                        <input
                            type="text"
                            value={ip}
                            onChange={(e) => setIp(e.target.value)}
                            required
                            className="input-field"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">
                            포트
                        </label>
                        <input
                            type="number"
                            value={port}
                            onChange={(e) => setPort(e.target.value)}
                            required
                            className="input-field"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">
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
        </div>
    );
};

export default AdminPanel; 