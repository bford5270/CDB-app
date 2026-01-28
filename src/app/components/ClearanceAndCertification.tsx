import { Shield, GraduationCap, AlertTriangle, CheckCircle } from 'lucide-react';
import { useState, useEffect } from 'react';

interface ClearanceAndCertificationProps {
  onDataChange: (data: ClearanceAndCertData) => void;
}

export interface ClearanceAndCertData {
  clearanceLevel: string;
  clearanceDate: string;
  clearanceStatus: string;
  boardCertified: boolean;
  boardCertStatus: 'J' | 'K' | 'neither' | '';
  certifyingBoard: string;
  certificationDate: string;
  recertificationDate: string;
}

export function ClearanceAndCertification({ onDataChange }: ClearanceAndCertificationProps) {
  const [data, setData] = useState<ClearanceAndCertData>({
    clearanceLevel: '',
    clearanceDate: '',
    clearanceStatus: 'current',
    boardCertified: false,
    boardCertStatus: '',
    certifyingBoard: '',
    certificationDate: '',
    recertificationDate: '',
  });

  useEffect(() => {
    onDataChange(data);
  }, [data, onDataChange]);

  const handleChange = (field: keyof ClearanceAndCertData, value: any) => {
    setData({ ...data, [field]: value });
  };

  const getClearanceAlert = () => {
    if (!data.clearanceLevel) return null;
    
    if (data.clearanceDate) {
      const clearanceDate = new Date(data.clearanceDate);
      const now = new Date();
      const monthsDiff = (now.getTime() - clearanceDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
      
      // Secret clearances expire after 10 years, TS after 5 years
      const expirationMonths = data.clearanceLevel === 'TS' ? 60 : 120;
      const warningMonths = expirationMonths - 6; // 6 months before expiration
      
      if (monthsDiff >= expirationMonths) {
        return {
          type: 'error',
          message: 'Clearance has expired. Must be renewed immediately.',
        };
      } else if (monthsDiff >= warningMonths) {
        return {
          type: 'warning',
          message: `Clearance expires soon. Reinvestigation should be initiated.`,
        };
      }
    }
    
    return null;
  };

  const getBoardCertAlert = () => {
    if (!data.boardCertified) {
      return {
        type: 'error',
        message: 'Board certification is expected for career Medical Corps officers.',
      };
    }
    
    if (data.boardCertStatus === 'J') {
      return {
        type: 'warning',
        message: 'J designation (board eligible, not certified). Should pursue K designation (board certified) for enhanced competitiveness.',
      };
    }
    
    if (data.recertificationDate) {
      const recertDate = new Date(data.recertificationDate);
      const now = new Date();
      const monthsUntilRecert = (recertDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30);
      
      if (monthsUntilRecert < 0) {
        return {
          type: 'error',
          message: 'Board certification has expired. Recertification required.',
        };
      } else if (monthsUntilRecert < 12) {
        return {
          type: 'warning',
          message: `Recertification due within ${Math.ceil(monthsUntilRecert)} months.`,
        };
      }
    }
    
    return null;
  };

  const clearanceAlert = getClearanceAlert();
  const boardCertAlert = getBoardCertAlert();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Security Clearance & Board Certification
        </h2>
        <p className="text-gray-600">
          Verify your security clearance is current and board certification status is accurate
        </p>
      </div>

      {/* Security Clearance Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-6 h-6 text-blue-600" />
          <h3 className="text-xl font-semibold text-gray-900">Security Clearance</h3>
        </div>

        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Clearance Level <span className="text-red-600">*</span>
              </label>
              <select
                value={data.clearanceLevel}
                onChange={(e) => handleChange('clearanceLevel', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Level</option>
                <option value="Secret">Secret</option>
                <option value="TS">Top Secret (TS)</option>
                <option value="TS/SCI">Top Secret/SCI</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Most Medical Corps officers hold Secret clearance
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date of Last Investigation
              </label>
              <input
                type="date"
                value={data.clearanceDate}
                onChange={(e) => handleChange('clearanceDate', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Clearance Status
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="clearanceStatus"
                  value="current"
                  checked={data.clearanceStatus === 'current'}
                  onChange={(e) => handleChange('clearanceStatus', e.target.value)}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm text-gray-700">Current</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="clearanceStatus"
                  value="expired"
                  checked={data.clearanceStatus === 'expired'}
                  onChange={(e) => handleChange('clearanceStatus', e.target.value)}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm text-gray-700">Expired</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="clearanceStatus"
                  value="in-process"
                  checked={data.clearanceStatus === 'in-process'}
                  onChange={(e) => handleChange('clearanceStatus', e.target.value)}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm text-gray-700">Reinvestigation In Process</span>
              </label>
            </div>
          </div>

          {clearanceAlert && (
            <div
              className={`rounded-lg p-4 ${
                clearanceAlert.type === 'error'
                  ? 'bg-red-50 border border-red-200'
                  : 'bg-yellow-50 border border-yellow-200'
              }`}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                    clearanceAlert.type === 'error' ? 'text-red-600' : 'text-yellow-600'
                  }`}
                />
                <p
                  className={`text-sm ${
                    clearanceAlert.type === 'error' ? 'text-red-800' : 'text-yellow-800'
                  }`}
                >
                  {clearanceAlert.message}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Board Certification Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <GraduationCap className="w-6 h-6 text-blue-600" />
          <h3 className="text-xl font-semibold text-gray-900">
            Board Certification Status (J vs K Designation)
          </h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                checked={data.boardCertified}
                onChange={(e) => handleChange('boardCertified', e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-sm font-medium text-gray-700">
                I am board certified or board eligible
              </span>
            </label>
          </div>

          {data.boardCertified && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-2">J vs K Designation</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>
                    <strong>J Designation:</strong> Board eligible but not yet certified (e.g.,
                    completed residency, not yet passed boards)
                  </li>
                  <li>
                    <strong>K Designation:</strong> Board certified by ABMS member board (highly
                    preferred for career progression)
                  </li>
                </ul>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Board Certification Status <span className="text-red-600">*</span>
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="boardCertStatus"
                      value="K"
                      checked={data.boardCertStatus === 'K'}
                      onChange={(e) => handleChange('boardCertStatus', e.target.value)}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm text-gray-700">
                      <strong>K</strong> - Board Certified
                    </span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="boardCertStatus"
                      value="J"
                      checked={data.boardCertStatus === 'J'}
                      onChange={(e) => handleChange('boardCertStatus', e.target.value)}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm text-gray-700">
                      <strong>J</strong> - Board Eligible
                    </span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="boardCertStatus"
                      value="neither"
                      checked={data.boardCertStatus === 'neither'}
                      onChange={(e) => handleChange('boardCertStatus', e.target.value)}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm text-gray-700">Neither</span>
                  </label>
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Certifying Board
                  </label>
                  <input
                    type="text"
                    value={data.certifyingBoard}
                    onChange={(e) => handleChange('certifyingBoard', e.target.value)}
                    placeholder="e.g., ABIM, ABFM, ABP"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {data.boardCertStatus === 'K' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Certification Date
                      </label>
                      <input
                        type="date"
                        value={data.certificationDate}
                        onChange={(e) => handleChange('certificationDate', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Recertification Due Date
                      </label>
                      <input
                        type="date"
                        value={data.recertificationDate}
                        onChange={(e) => handleChange('recertificationDate', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {boardCertAlert && (
            <div
              className={`rounded-lg p-4 ${
                boardCertAlert.type === 'error'
                  ? 'bg-red-50 border border-red-200'
                  : 'bg-yellow-50 border border-yellow-200'
              }`}
            >
              <div className="flex items-start gap-2">
                {boardCertAlert.type === 'error' ? (
                  <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                )}
                <p
                  className={`text-sm ${
                    boardCertAlert.type === 'error' ? 'text-red-800' : 'text-yellow-800'
                  }`}
                >
                  {boardCertAlert.message}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
        <h4 className="font-semibold text-gray-900 mb-3">Why This Matters</h4>
        <ul className="space-y-2 text-sm text-gray-700">
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>
              <strong>Security Clearance:</strong> Required for operational assignments, deployment
              eligibility, and access to classified information. Expired clearances can limit assignment options.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>
              <strong>K Designation (Board Certified):</strong> Demonstrates clinical excellence and
              is highly valued by promotion boards. Medical officers with K designation are more
              competitive for advancement and specialty assignments.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>
              <strong>J to K Transition:</strong> Officers with J designation should prioritize
              board certification. Boards view this as commitment to clinical expertise.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
