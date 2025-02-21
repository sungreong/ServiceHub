import { useNavigate } from 'react-router-dom';

const Sidebar = () => {
    const navigate = useNavigate();

    const handleServiceListClick = () => {
        // 서비스 권한 업데이트 이벤트 발생
        window.dispatchEvent(new Event('servicePermissionsUpdated'));
        navigate('/services');
    };

    return (
        <div className="...">
            {/* ... 다른 사이드바 항목들 ... */}
            <div 
                onClick={handleServiceListClick}
                className="cursor-pointer p-4 hover:bg-gray-100"
            >
                서비스 목록
            </div>
            {/* ... */}
        </div>
    );
}; 