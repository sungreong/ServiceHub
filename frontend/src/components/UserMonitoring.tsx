import React, { useState, useEffect } from 'react';
import { getUserServicesStats, getUserServiceDetailStats } from '../api/monitoring';
import { FaUsers, FaCalendarAlt, FaClock, FaServer, FaCheck, FaTimes, FaChartLine, FaHistory, FaArrowLeft } from 'react-icons/fa';

interface UserServiceStats {
  service_id: string;
  service_name: string;
  status: 'running' | 'stopped' | 'unknown';
  today_accesses: number;
  total_period_accesses: number;
  active_sessions: number;
  concurrent_users: number;
  total_active_users: number;
  last_access: string | null;
  daily_stats: {
    date: string;
    accesses: number;
    day_of_week: string;
  }[];
}

interface UserServicesData {
  user_email: string;
  user_id: number;
  is_admin: boolean;
  total_services: number;
  total_accesses: number;
  period_days: number;
  services_stats: UserServiceStats[];
}

interface ServiceDetailData {
  service_id: string;
  service_name: string;
  status: 'running' | 'stopped' | 'unknown';
  status_details: string;
  user_email: string;
  total_stats: {
    all_time_accesses: number;
    today_accesses: number;
    period_accesses: number;
    active_sessions: number;
    first_access: string | null;
    last_access: string | null;
    concurrent_users: number;
    other_active_users: string[];
  };
  daily_stats: {
    date: string;
    day_of_week: string;
    total_accesses: number;
    hourly_stats: {
      hour: number;
      formatted_hour: string;
      accesses: number;
    }[];
  }[];
  access_logs: {
    timestamp: string;
    type: string;
    session_id: string;
    is_active: boolean;
    access_id: number;
  }[];
  period_days: number;
}

const UserMonitoring: React.FC = () => {
  const [servicesData, setServicesData] = useState<UserServicesData | null>(null);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [serviceDetail, setServiceDetail] = useState<ServiceDetailData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [periodDays, setPeriodDays] = useState<number>(7);

  // 서비스 통계 조회
  useEffect(() => {
    const fetchServicesStats = async () => {
      setLoading(true);
      try {
        const data = await getUserServicesStats();
        setServicesData(data);
        setError(null);
      } catch (err) {
        setError('서비스 통계 조회 중 오류가 발생했습니다.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchServicesStats();
    // 1분 간격으로 자동 갱신
    const intervalId = setInterval(fetchServicesStats, 60000);
    return () => clearInterval(intervalId);
  }, [periodDays]);

  // 특정 서비스 상세 조회
  useEffect(() => {
    if (!selectedService) {
      setServiceDetail(null);
      return;
    }

    const fetchServiceDetail = async () => {
      setDetailLoading(true);
      try {
        const data = await getUserServiceDetailStats(selectedService);
        setServiceDetail(data);
        setError(null);
      } catch (err) {
        setError('서비스 상세 정보 조회 중 오류가 발생했습니다.');
        console.error(err);
      } finally {
        setDetailLoading(false);
      }
    };

    fetchServiceDetail();
  }, [selectedService, periodDays]);


  // 날짜 형식화
  const formatDate = (dateString: string | null) => {
    if (!dateString) return '없음';
    
    try {
      const date = new Date(dateString);
      return date.toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } catch (e) {
      return dateString;
    }
  };

  // 서비스 선택 핸들러
  const handleServiceSelect = (serviceId: string) => {
    setSelectedService(serviceId === selectedService ? null : serviceId);
  };

  // 서비스 목록으로 돌아가기
  const backToList = () => {
    setSelectedService(null);
  };

  // 기간 변경 핸들러
  const handlePeriodChange = (days: number) => {
    setPeriodDays(days);
  };

  // 로딩 중 표시
  if (loading && !servicesData) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        <div className="ml-4 text-blue-500">서비스 정보를 불러오는 중...</div>
      </div>
    );
  }

  // 에러 표시
  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg my-4" role="alert">
        <div className="font-bold mb-1">오류 발생</div>
        <p>{error}</p>
      </div>
    );
  }

  // 서비스가 없는 경우
  if (servicesData && servicesData.services_stats.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6 my-4">
        <h2 className="text-2xl font-bold mb-4">내 서비스 모니터링</h2>
        <div className="p-8 text-center text-gray-500">
          <p className="mb-4">접근 가능한 서비스가 없습니다.</p>
          <p>서비스에 접근하려면 관리자에게 권한을 요청하세요.</p>
        </div>
      </div>
    );
  }

  // 서비스 상세 정보 표시
  if (selectedService && serviceDetail) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6 my-4">
        <div className="flex items-center mb-6">
          <button 
            onClick={backToList} 
            className="mr-4 bg-gray-200 hover:bg-gray-300 text-gray-800 p-2 rounded-full"
          >
            <FaArrowLeft />
          </button>
          <h2 className="text-2xl font-bold">{serviceDetail.service_name} 상세 정보</h2>
          <span 
            className={`ml-4 px-3 py-1 rounded-full text-sm ${
              serviceDetail.status === 'running' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}
          >
            {serviceDetail.status === 'running' ? '운영 중' : '중지됨'}
          </span>
        </div>

        {detailLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
            <div className="ml-3">상세 정보를 불러오는 중...</div>
          </div>
        ) : (
          <>
            {/* 요약 통계 카드 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-blue-50 rounded-lg p-4 shadow">
                <div className="flex items-center mb-3">
                  <FaCalendarAlt className="text-blue-500 mr-2" />
                  <h3 className="font-bold">오늘 접속 횟수</h3>
                </div>
                <p className="text-3xl font-bold text-blue-700">{serviceDetail.total_stats.today_accesses}회</p>
              </div>
              
              <div className="bg-green-50 rounded-lg p-4 shadow">
                <div className="flex items-center mb-3">
                  <FaUsers className="text-green-500 mr-2" />
                  <h3 className="font-bold">현재 동시 접속자</h3>
                </div>
                <p className="text-3xl font-bold text-green-700">{serviceDetail.total_stats.concurrent_users}명</p>
                <p className="text-xs text-gray-500 mt-1">
                  {serviceDetail.total_stats.other_active_users.length > 0 ? (
                    <>같이 접속 중: {serviceDetail.total_stats.other_active_users.join(', ')}</>
                  ) : (
                    '다른 접속자 없음'
                  )}
                </p>
              </div>
              
              <div className="bg-purple-50 rounded-lg p-4 shadow">
                <div className="flex items-center mb-3">
                  <FaClock className="text-purple-500 mr-2" />
                  <h3 className="font-bold">활성 세션</h3>
                </div>
                <p className="text-3xl font-bold text-purple-700">{serviceDetail.total_stats.active_sessions}개</p>
              </div>
              
              <div className="bg-yellow-50 rounded-lg p-4 shadow">
                <div className="flex items-center mb-3">
                  <FaChartLine className="text-yellow-500 mr-2" />
                  <h3 className="font-bold">총 접속 횟수</h3>
                </div>
                <p className="text-3xl font-bold text-yellow-700">{serviceDetail.total_stats.all_time_accesses}회</p>
              </div>
            </div>
            
            {/* 접속 이력 */}
            <div className="mb-8">
              <h3 className="text-xl font-bold mb-4 flex items-center">
                <FaHistory className="mr-2" />
                접속 이력
              </h3>
              
              <div className="bg-gray-50 rounded-lg p-4 shadow">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-gray-500 mb-1">첫 접속 일시</p>
                    <p className="font-semibold">{formatDate(serviceDetail.total_stats.first_access)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 mb-1">최근 접속 일시</p>
                    <p className="font-semibold">{formatDate(serviceDetail.total_stats.last_access)}</p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* 일별 통계 차트 */}
            {serviceDetail.daily_stats && serviceDetail.daily_stats.length > 0 ? (
              <div className="mb-8">
                <h3 className="text-xl font-bold mb-4">일별 접속 통계</h3>
                <div className="bg-white rounded-lg p-4 shadow-inner border border-gray-200">
                  <div className="overflow-x-auto">
                    <div className="flex space-x-2 min-w-max">
                      {serviceDetail.daily_stats.map((day, index) => (
                        <div key={index} className="flex flex-col items-center w-20">
                          <div className="h-32 w-full flex items-end justify-center">
                            <div
                              className="w-12 bg-blue-500 rounded-t"
                              style={{
                                height: `${Math.max(
                                  5,
                                  (day.total_accesses / (serviceDetail.daily_stats && serviceDetail.daily_stats.length > 0 
                                    ? Math.max(...serviceDetail.daily_stats.map(d => d.total_accesses)) 
                                    : 1)) * 100
                                )}%`
                              }}
                            ></div>
                          </div>
                          <p className="text-xs text-gray-600 mt-2">{day.date.slice(5)}</p>
                          <p className="text-sm font-bold">{day.total_accesses}회</p>
                          <p className="text-xs text-gray-500">{day.day_of_week.slice(0, 3)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center p-6 bg-gray-50 rounded-lg mb-8">
                <p className="text-gray-500">해당 기간에 접속 기록이 없습니다.</p>
              </div>
            )}
            
            {/* 최근 로그 */}
            <div>
              <h3 className="text-xl font-bold mb-4">최근 접속 로그</h3>
              
              {serviceDetail.access_logs && serviceDetail.access_logs.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full bg-white rounded-lg overflow-hidden shadow">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="py-3 px-4 text-left">시간</th>
                        <th className="py-3 px-4 text-left">활동</th>
                        <th className="py-3 px-4 text-left">세션 ID</th>
                        <th className="py-3 px-4 text-left">상태</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {serviceDetail.access_logs && serviceDetail.access_logs.map((log, index) => (
                        <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                          <td className="py-2 px-4 text-sm">{formatDate(log.timestamp)}</td>
                          <td className="py-2 px-4 text-sm">
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                log.type === '접속' ? 'bg-green-100 text-green-800' :
                                log.type === '활동' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {log.type}
                            </span>
                          </td>
                          <td className="py-2 px-4 text-sm font-mono text-xs">{log.session_id.substring(0, 10)}...</td>
                          <td className="py-2 px-4 text-sm">
                            {log.is_active ? (
                              <span className="text-green-500 flex items-center">
                                <FaCheck className="mr-1" /> 활성
                              </span>
                            ) : (
                              <span className="text-gray-500 flex items-center">
                                <FaTimes className="mr-1" /> 종료
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center p-6 bg-gray-50 rounded-lg">
                  <p className="text-gray-500">접속 로그가 없습니다.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  // 서비스 목록 표시
  return (
    <div className="bg-white rounded-lg shadow-lg p-6 my-4">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">내 서비스 모니터링</h2>
        
        <div className="flex space-x-2">
          <button
            onClick={() => handlePeriodChange(7)}
            className={`px-3 py-1 rounded-md text-sm ${
              periodDays === 7 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'
            }`}
          >
            7일
          </button>
          <button
            onClick={() => handlePeriodChange(14)}
            className={`px-3 py-1 rounded-md text-sm ${
              periodDays === 14 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'
            }`}
          >
            14일
          </button>
          <button
            onClick={() => handlePeriodChange(30)}
            className={`px-3 py-1 rounded-md text-sm ${
              periodDays === 30 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'
            }`}
          >
            30일
          </button>
        </div>
      </div>

      {/* 요약 정보 */}
      {servicesData && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 rounded-lg p-4 shadow">
            <h3 className="font-bold text-blue-800 mb-1">접근 가능 서비스</h3>
            <p className="text-2xl font-bold">{servicesData.total_services}개</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4 shadow">
            <h3 className="font-bold text-green-800 mb-1">총 접속 횟수</h3>
            <p className="text-2xl font-bold">{servicesData.total_accesses}회</p>
            <p className="text-xs text-gray-500">최근 {servicesData.period_days}일간</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-4 shadow">
            <h3 className="font-bold text-purple-800 mb-1">사용자</h3>
            <p className="text-lg font-bold">{servicesData.user_email}</p>
            <p className="text-xs text-gray-500">
              {servicesData.is_admin ? '관리자 권한' : '일반 사용자 권한'}
            </p>
          </div>
        </div>
      )}

      {/* 서비스 목록 */}
      <h3 className="text-xl font-bold mb-4">서비스 목록</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {servicesData && servicesData.services_stats && servicesData.services_stats.map((service) => (
          <div
            key={service.service_id}
            className="border rounded-lg hover:shadow-md transition-shadow cursor-pointer bg-white"
            onClick={() => handleServiceSelect(service.service_id)}
          >
            <div className="p-4 border-b">
              <div className="flex justify-between items-center">
                <h4 className="font-bold text-lg">{service.service_name}</h4>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    service.status === 'running' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}
                >
                  {service.status === 'running' ? '운영 중' : '중지됨'}
                </span>
              </div>
            </div>
            
            <div className="p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">오늘 접속</p>
                  <p className="font-bold">{service.today_accesses}회</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">활성 세션</p>
                  <p className="font-bold">{service.active_sessions}개</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">기간내 접속</p>
                  <p className="font-bold">{service.total_period_accesses}회</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">동시 접속자</p>
                  <p className="font-bold">{service.concurrent_users}명</p>
                </div>
              </div>
              
              {service.last_access && (
                <div className="mt-4 pt-4 border-t text-sm text-gray-500">
                  <p>마지막 접속: {formatDate(service.last_access)}</p>
                </div>
              )}
              
              <div className="mt-4">
                <button
                  className="text-blue-500 hover:text-blue-700 text-sm font-semibold"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleServiceSelect(service.service_id);
                  }}
                >
                  상세보기 →
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default UserMonitoring; 