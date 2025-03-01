import React, { useState, useEffect } from 'react';
import {
  getAccessStats,
  getServiceAccessStats,
  getServiceDetailedStats,
  getUserStatsForService,
  getDailyStatsForService
} from '../api/monitoring';
import { FaUsers, FaChartLine, FaCalendarAlt, FaServer, FaMicrochip, FaMemory, FaExchangeAlt, FaExclamationTriangle, FaClock, FaCircle, FaTerminal, FaHistory, FaUserFriends, FaRegCalendarAlt } from 'react-icons/fa';

interface ServiceAccessStats {
  service_id: string;
  service_name: string;
  active_users: number;
  total_accesses: number;
  status: 'running' | 'stopped';
}

interface AccessStats {
  total_active_users: number;
  total_accesses: number;
  period: string;
  start_date: string;
  end_date: string; 
  services_stats: ServiceAccessStats[];
}

interface ServiceDetailStats {
  service_id: string;
  service_name: string;
  active_users: number;
  unique_users: number;
  total_accesses: number;
  period: string;
  start_date: string;
  end_date: string;
  status: string;
  last_status_change: string;
  hourly_stats: { date: string; hour: string; datetime: string; count: number }[];
}

// 상세 모니터링 데이터 인터페이스 추가
interface DetailedMonitoringData {
  cpu: number[];
  memory: number[];
  requests: number[];
  errors: number[];
  responseTime: number[];
  timestamps: string[];
  status: {
    current: 'running' | 'stopped';
    last_changed: string;
    uptime_percentage: number;
  };
  recent_logs: {
    timestamp: string;
    level: string;
    message: string;
    service_id: string;
  }[];
  // 사용자별 통계 추가
  user_stats?: {
    user_id: string;
    email: string;
    total_accesses: number;
    last_access: string;
  }[];
  // 날짜별 통계 추가
  daily_stats?: {
    date: string;
    total_accesses: number;
    unique_users: number;
  }[];
}

const Monitoring: React.FC = () => {
  const [stats, setStats] = useState<AccessStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [serviceStats, setServiceStats] = useState<ServiceDetailStats | null>(null);
  const [serviceLoading, setServiceLoading] = useState<boolean>(false);
  
  // 상세 모니터링 데이터 상태 추가
  const [detailedStats, setDetailedStats] = useState<DetailedMonitoringData | null>(null);
  const [activeTab, setActiveTab] = useState<'basic' | 'detailed' | 'logs' | 'user_stats' | 'daily_stats'>('basic');

  // 기간 선택 상태 추가
  const [period, setPeriod] = useState<string>('today');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [useCustomDateRange, setUseCustomDateRange] = useState<boolean>(false);
  
  // 오늘 날짜를 기본값으로 설정
  useEffect(() => {
    const today = new Date();
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    setEndDate(formatDate(today));
    // 기본 시작일은 7일 전
    const startDay = new Date();
    startDay.setDate(today.getDate() - 7);
    setStartDate(formatDate(startDay));
  }, []);

  // 전체 통계 데이터 로드
  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        console.log('[데이터 로딩] 전체 통계 데이터 요청 시작');
        
        let data;
        if (useCustomDateRange && startDate && endDate) {
          console.log(`[데이터 로딩] 사용자 지정 기간: ${startDate} ~ ${endDate}`);
          data = await getAccessStats('custom', startDate, endDate);
        } else {
          console.log(`[데이터 로딩] 사전 정의 기간: ${period}`);
          data = await getAccessStats(period);
        }
        
        console.log('[데이터 응답]', data);
        
        if (data) {
          // 서비스 통계가 배열인지 확인 (map 에러 방지)
          if (!data.services_stats) {
            console.warn('[데이터 경고] services_stats 필드가 없어 빈 배열로 초기화합니다');
            data.services_stats = [];
          }
          
          console.log('[데이터 성공] 통계 데이터 설정: 서비스 갯수', data.services_stats.length);
          setStats(data);
          setError(null);
        } else {
          console.error('[데이터 오류] 빈 응답:', data);
          // 빈 배열로 초기화하여 map 에러를 방지합니다
          setStats({
            total_active_users: 0,
            total_accesses: 0,
            period: period,
            start_date: startDate || '',
            end_date: endDate || '',
            services_stats: []
          });
          setError('통계 데이터를 불러올 수 없습니다.');
        }
      } catch (err) {
        console.error('[데이터 예외] 통계 데이터 로드 중 오류:', err);
        // 에러 발생 시에도 빈 배열로 초기화
        setStats({
          total_active_users: 0,
          total_accesses: 0,
          period: period,
          start_date: startDate || '',
          end_date: endDate || '',
          services_stats: []
        });
        setError('통계 데이터 로드 중 오류가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    // 1분마다 데이터 갱신
    const interval = setInterval(fetchStats, 60000);
    return () => clearInterval(interval);
  }, [period, startDate, endDate, useCustomDateRange]);

  // 특정 서비스 통계 데이터 로드
  useEffect(() => {
    if (!selectedService) {
      setServiceStats(null);
      setDetailedStats(null);
      return;
    }

    const fetchServiceStats = async () => {
      setServiceLoading(true);
      try {
        let data;
        if (useCustomDateRange && startDate && endDate) {
          data = await getServiceAccessStats(selectedService, 'custom', startDate, endDate);
        } else {
          data = await getServiceAccessStats(selectedService, period);
        }
        
        if (data) {
          setServiceStats(data);
          // 상세 모니터링 데이터 로드
          loadDetailedStats(selectedService);
        } else {
          setError(`서비스 ${selectedService} 통계를 불러올 수 없습니다.`);
        }
      } catch (err) {
        setError('서비스 통계 로드 중 오류가 발생했습니다.');
        console.error(err);
      } finally {
        setServiceLoading(false);
      }
    };

    fetchServiceStats();
  }, [selectedService, period, startDate, endDate, useCustomDateRange]);

  // 상세 모니터링 데이터 로드 함수
  const loadDetailedStats = async (serviceId: string) => {
    try {
      // 1. 기본 상세 모니터링 데이터 로드
      const detailedData = await getServiceDetailedStats(serviceId);
      
      // 2. 사용자별 통계 데이터 로드
      const userStatsData = await getUserStatsForService(serviceId);
      
      // 3. 날짜별 통계 데이터 로드
      const dailyStatsData = await getDailyStatsForService(serviceId);
      
      // 데이터 병합
      const combinedData = {
        ...detailedData,
        user_stats: userStatsData?.user_stats || [],
        daily_stats: dailyStatsData?.daily_stats || []
      };
      
      if (combinedData) {
        setDetailedStats(combinedData);
      } else {
        setError('상세 모니터링 데이터를 불러올 수 없습니다.');
      }
    } catch (err) {
      console.error('상세 모니터링 데이터 로드 실패:', err);
      setError('상세 모니터링 데이터를 불러올 수 없습니다.');
    }
  };

  // 서비스 선택 핸들러
  const handleServiceSelect = (serviceId: string) => {
    setSelectedService(serviceId === selectedService ? null : serviceId);
    setActiveTab('basic'); // 서비스 선택 시 기본 탭으로 초기화
  };

  // 날짜 현지화 함수 추가
  const formatLocalDate = (dateString: string): string => {
    if (!dateString) return '정보 없음';
    
    try {
      // UTC 시간대의 날짜 문자열을 Date 객체로 변환
      const date = new Date(dateString);
      
      // 유효한 날짜인지 확인
      if (isNaN(date.getTime())) return dateString;
      
      // 현지 시간대로 표시
      return new Intl.DateTimeFormat(navigator.language || 'ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(date);
    } catch (e) {
      console.error('날짜 포맷 에러:', e);
      return dateString;
    }
  };

  // 상태에 따른 색상 및 텍스트 반환
  const getStatusInfo = (status: string) => {
    if (status === 'running') {
      return { color: 'text-green-500', bg: 'bg-green-100', text: '운영 중' };
    } else {
      return { color: 'text-red-500', bg: 'bg-red-100', text: '중지됨' };
    }
  };

  // 특정 시간대에 사용 트렌드 확인
  const getPeakHours = (hourlyStats: { hour: string; count: number }[]): string => {
    if (!hourlyStats || hourlyStats.length === 0) return '데이터 없음';
    
    const sortedHours = [...hourlyStats].sort((a, b) => b.count - a.count);
    const topHours = sortedHours.slice(0, 3).filter(h => h.count > 0);
    
    if (topHours.length === 0) return '접속 기록 없음';
    
    return topHours.map(h => {
      const hourPart = h.hour.split(' ')[1].split(':')[0];
      return `${hourPart}시 (${h.count}회)`;
    }).join(', ');
  };

  // 서비스 로그 렌더링
  const renderServiceLogs = () => {
    if (!detailedStats) {
      return (
        <div className="text-center text-gray-500 py-10">
          로그 데이터를 불러올 수 없습니다.
        </div>
      );
    }
    
    if (!detailedStats.recent_logs || !detailedStats.recent_logs.length) {
      return (
        <div className="text-center text-gray-500 py-10">
          로그 데이터가 없습니다.
        </div>
      );
    }

    return (
      <div className="bg-gray-900 text-gray-100 rounded-lg p-4 font-mono text-sm overflow-auto max-h-96">
        {detailedStats.recent_logs.map((log, idx) => {
          let logClass = 'text-gray-300'; // 기본 로그
          
          if (log.level === 'ERROR') logClass = 'text-red-400';
          else if (log.level === 'WARN') logClass = 'text-yellow-400';
          else if (log.level === 'INFO') logClass = 'text-blue-400';
          else if (log.level === 'DEBUG') logClass = 'text-green-400';
          
          return (
            <div key={idx} className={`${logClass} pb-1`}>
              <span className="text-gray-500">[{log.timestamp}]</span>{' '}
              <span className="font-bold">{log.level}:</span>{' '}
              {log.message}
            </div>
          );
        })}
      </div>
    );
  };


  // 사용자별 접속 통계 렌더링
  const renderUserStats = () => {
    if (!detailedStats || !detailedStats.user_stats) {
      return (
        <div className="text-center text-gray-500 py-10">
          사용자별 통계 데이터를 불러올 수 없습니다.
        </div>
      );
    }
    
    return (
      <div className="space-y-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">사용자별 접속 통계</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">사용자</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">접속 횟수</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">마지막 접속</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {detailedStats.user_stats.length > 0 ? (
                  detailedStats.user_stats.map((user, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{user.email}({user.user_id})</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{user.total_accesses}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{formatLocalDate(user.last_access)}</div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="px-6 py-4 text-center text-gray-500">
                      데이터가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // 날짜별 접속 통계 렌더링
  const renderDailyStats = () => {
    if (!detailedStats || !detailedStats.daily_stats) {
      return (
        <div className="text-center text-gray-500 py-10">
          날짜별 통계 데이터를 불러올 수 없습니다.
        </div>
      );
    }
    
    return (
      <div className="space-y-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">날짜별 접속 통계</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">날짜</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">접속 횟수</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">고유 사용자</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {detailedStats.daily_stats.length > 0 ? (
                  detailedStats.daily_stats.map((day, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{formatLocalDate(day.date)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{day.total_accesses}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{day.unique_users}</div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="px-6 py-4 text-center text-gray-500">
                      데이터가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // 기간 변경 핸들러 추가
  const handlePeriodChange = (newPeriod: string) => {
    setPeriod(newPeriod);
    setUseCustomDateRange(false);
  };
  
  // 사용자 정의 기간 적용 핸들러
  const handleApplyCustomDateRange = () => {
    if (startDate && endDate) {
      setUseCustomDateRange(true);
    } else {
      alert('시작일과 종료일을 모두 선택해 주세요.');
    }
  };

  // 기간 선택 UI 렌더링
  const renderPeriodSelector = () => {
    return (
      <div className="mb-6 bg-white p-4 rounded-lg shadow-md">
        <h3 className="text-lg font-semibold mb-3 flex items-center">
          <FaCalendarAlt className="mr-2 text-blue-500" />
          조회 기간 설정
        </h3>
        
        <div className="flex flex-wrap gap-2 mb-3">
          <button 
            onClick={() => handlePeriodChange('today')}
            className={`px-3 py-1 rounded-md text-sm ${period === 'today' && !useCustomDateRange ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
          >
            오늘
          </button>
          <button 
            onClick={() => handlePeriodChange('yesterday')}
            className={`px-3 py-1 rounded-md text-sm ${period === 'yesterday' && !useCustomDateRange ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
          >
            어제
          </button>
          <button 
            onClick={() => handlePeriodChange('week')}
            className={`px-3 py-1 rounded-md text-sm ${period === 'week' && !useCustomDateRange ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
          >
            최근 7일
          </button>
          <button 
            onClick={() => handlePeriodChange('month')}
            className={`px-3 py-1 rounded-md text-sm ${period === 'month' && !useCustomDateRange ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
          >
            최근 30일
          </button>
          <button 
            onClick={() => handlePeriodChange('year')}
            className={`px-3 py-1 rounded-md text-sm ${period === 'year' && !useCustomDateRange ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
          >
            최근 1년
          </button>
          <button 
            onClick={() => handlePeriodChange('all')}
            className={`px-3 py-1 rounded-md text-sm ${period === 'all' && !useCustomDateRange ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
          >
            전체 기간
          </button>
        </div>
        
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center">
              <label htmlFor="start-date" className="text-sm font-medium text-gray-700 mr-2">시작일:</label>
              <input 
                type="date" 
                id="start-date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border rounded-md px-2 py-1 text-sm"
              />
            </div>
            
            <div className="flex items-center">
              <label htmlFor="end-date" className="text-sm font-medium text-gray-700 mr-2">종료일:</label>
              <input 
                type="date" 
                id="end-date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border rounded-md px-2 py-1 text-sm"
              />
            </div>
            
            <button 
              onClick={handleApplyCustomDateRange}
              className={`px-3 py-1 rounded-md text-sm ${useCustomDateRange ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
            >
              적용
            </button>
          </div>
          
          {useCustomDateRange && (
            <div className="mt-2 text-sm text-blue-600">
              {startDate} ~ {endDate} 기간의 데이터를 조회 중입니다.
            </div>
          )}
        </div>
      </div>
    );
  };


  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
        <strong className="font-bold">오류!</strong>
        <span className="block sm:inline"> {error}</span>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">관리자 모니터링 대시보드</h1>
      
      {/* 요약 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex items-center">
            <FaUsers className="text-blue-500 text-3xl mr-4" />
            <div>
              <p className="text-gray-500">현재 활성 유저</p>
              <p className="text-2xl font-bold">{stats?.total_active_users || 0}</p>
              <p className="text-xs text-gray-500 mt-1">현재 서비스에 접속 중인 고유 사용자 수</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex items-center">
            <FaCalendarAlt className="text-green-500 text-3xl mr-4" />
            <div>
              <p className="text-gray-500">오늘 총 접속 수</p>
              <p className="text-2xl font-bold">{stats?.total_accesses || 0}</p>
              <p className="text-xs text-gray-500 mt-1">오늘 발생한 모든 서비스 접속 횟수</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex items-center">
            <FaServer className="text-purple-500 text-3xl mr-4" />
            <div>
              <p className="text-gray-500">등록된 서비스</p>
              <p className="text-2xl font-bold">{stats?.services_stats?.length || 0}</p>
              <p className="text-xs text-gray-500 mt-1">
                운영 중: {stats?.services_stats?.filter(s => s.status === 'running')?.length || 0} / 
                중지: {stats?.services_stats?.filter(s => s.status === 'stopped')?.length || 0}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex items-center">
            <FaChartLine className="text-yellow-500 text-3xl mr-4" />
            <div>
              <p className="text-gray-500">평균 접속 수</p>
              <p className="text-2xl font-bold">
                {stats?.services_stats.length 
                  ? Math.round(stats.total_accesses / stats.services_stats.length) 
                  : 0}
              </p>
              <p className="text-xs text-gray-500 mt-1">서비스당 평균 접속 수</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* 통계 설명 추가 */}
      <div className="bg-blue-50 p-4 rounded-lg mb-8">
        <h3 className="text-lg font-semibold text-blue-800 mb-2">접속 통계 수집 기준</h3>
        <ul className="list-disc pl-5 space-y-2 text-sm text-blue-800">
          <li><strong>현재 활성 유저 수</strong>: 서비스에 현재 접속 중인 고유한 사용자 수입니다. 한 사용자가 여러 세션으로 접속해도 한 명으로 카운트됩니다.</li>
          <li><strong>오늘 총 접속 수</strong>: 오늘(00:00부터 현재까지) 발생한 모든 서비스 접속 횟수입니다. 같은 사용자가 여러 번 접속하면 각각 별도로 카운트됩니다.</li>
          <li><strong>서비스 상태</strong>: '운영 중'은 현재 서비스가 정상 작동 중임을, '중지'는 서비스가 중단되었음을 의미합니다.</li>
        </ul>
      </div>
      
      {/* 기간 선택 UI */}
      {renderPeriodSelector()}
      
      {/* 서비스별 통계 테이블 */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">서비스별 접속 통계</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  서비스 이름
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  상태
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  현재 활성 유저
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  오늘 총 접속 수
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  상세 보기
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {stats?.services_stats && stats.services_stats.length > 0 ? (
                stats.services_stats.map((service) => {
                  const statusInfo = getStatusInfo(service.status);
                  return (
                    <tr 
                      key={service.service_id}
                      className={selectedService === service.service_id ? "bg-blue-50" : ""}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{service.service_name}</div>
                        <div className="text-sm text-gray-500">{service.service_id}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusInfo.bg} ${statusInfo.color}`}>
                          {statusInfo.text}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{service.active_users}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{service.total_accesses}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleServiceSelect(service.service_id);
                          }}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          {selectedService === service.service_id ? '접기' : '상세 보기'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                    서비스 데이터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* 선택된 서비스 상세 통계 */}
      {selectedService && (
        <div className="bg-white rounded-lg shadow-md overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">
                {serviceStats?.service_name || '서비스'} 상세 통계
                {serviceStats?.status && (
                  <span className={`ml-2 px-2 py-1 text-xs font-semibold rounded-full ${getStatusInfo(serviceStats.status).bg} ${getStatusInfo(serviceStats.status).color}`}>
                    {getStatusInfo(serviceStats.status).text}
                  </span>
                )}
              </h2>
              <div className="flex space-x-2">
                <button
                  onClick={() => setActiveTab('basic')}
                  className={`px-4 py-2 rounded-md ${
                    activeTab === 'basic' 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  기본 통계
                </button>
                <button
                  onClick={() => setActiveTab('logs')}
                  className={`px-4 py-2 rounded-md ${
                    activeTab === 'logs' 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  로그
                </button>
                <button
                  onClick={() => setActiveTab('user_stats')}
                  className={`px-4 py-2 rounded-md ${
                    activeTab === 'user_stats' 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  사용자별 통계
                </button>
                <button
                  onClick={() => setActiveTab('daily_stats')}
                  className={`px-4 py-2 rounded-md ${
                    activeTab === 'daily_stats' 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  날짜별 통계
                </button>
              </div>
            </div>
          </div>
          
          {serviceLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : serviceStats ? (
            <div className="p-6">
              {activeTab === 'basic' ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-gray-500">현재 활성 유저</p>
                      <p className="text-2xl font-bold">{serviceStats.active_users}</p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-gray-500">오늘 총 접속 수</p>
                      <p className="text-2xl font-bold">{serviceStats.total_accesses}</p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-gray-500">마지막 상태 변경</p>
                      <p className="text-md">{formatLocalDate(serviceStats.last_status_change) || '정보 없음'}</p>
                    </div>
                  </div>
                  
                  <h3 className="text-md font-semibold mb-4">시간별 접속 통계 (최근 24시간)</h3>
                  
                  {serviceStats.hourly_stats && serviceStats.hourly_stats.length > 0 ? (
                    <div className="h-64 overflow-hidden">
                      <div className="flex h-full">
                        {serviceStats.hourly_stats.map((hour, index) => {
                          const maxCount = Math.max(...serviceStats.hourly_stats.map(h => h.count));
                          const height = maxCount > 0 ? (hour.count / maxCount) * 100 : 0;
                          
                          return (
                            <div key={index} className="flex flex-col items-center flex-1">
                              <div className="w-full flex-1 flex items-end">
                                <div 
                                  className="w-full bg-blue-500 rounded-t"
                                  style={{ height }}
                                ></div>
                              </div>
                              <div className="text-xs text-gray-500 mt-2 transform -rotate-45 origin-top-left">
                                {hour.hour.split(' ')[1]}
                              </div>
                              <div className="text-xs font-bold mt-1">
                                {hour.count}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 py-10">
                      시간별 통계 데이터가 없습니다.
                    </div>
                  )}
                </>
              )  : activeTab === 'user_stats' ? (
                renderUserStats()
              ) : activeTab === 'daily_stats' ? (
                renderDailyStats()
              ) : (
                <div className="mb-4">
                  <div className="flex items-center mb-4">
                    <FaTerminal className="text-gray-700 text-xl mr-2" />
                    <h3 className="text-lg font-semibold">서비스 로그</h3>
                  </div>
                  {renderServiceLogs()}
                </div>
              )}
            </div>
          ) : (
            <div className="p-6 text-center text-gray-500">
              데이터를 불러오는 중 오류가 발생했습니다.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Monitoring; 