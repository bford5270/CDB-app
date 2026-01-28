import { useState } from 'react';
import { Award, Search, Plus, X } from 'lucide-react';

interface AQDSelectorProps {
  onAQDsChange: (selectedAQDs: string[]) => void;
}

const commonAQDs = [
  { code: 'SW5', name: 'Surface Warfare Medical Department Officer' },
  { code: 'D7A', name: 'Flight Surgeon (Basic)' },
  { code: 'D6A', name: 'Undersea Medical Officer' },
  { code: 'D6B', name: 'Dive Medical Officer' },
  { code: '2D1', name: 'Medical Department Head' },
  { code: '2D2', name: 'Medical Officer in Charge' },
  { code: 'JP1', name: 'Joint Qualified Officer' },
  { code: 'BC1', name: 'Board Certified in Medical Specialty' },
  { code: '2P3', name: 'Assistant Professor' },
  { code: '2P4', name: 'Associate Professor' },
  { code: 'BM1', name: 'Operational Medicine' },
  { code: 'G1A', name: 'GME Program Director' },
  { code: '6XP', name: 'Principal Investigator' },
  { code: 'PH1', name: 'Public Health Officer' },
];

export function AQDSelector({ onAQDsChange }: AQDSelectorProps) {
  const [selectedAQDs, setSelectedAQDs] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [customAQD, setCustomAQD] = useState('');

  const filteredAQDs = commonAQDs.filter(
    (aqd) =>
      (aqd.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        aqd.name.toLowerCase().includes(searchTerm.toLowerCase())) &&
      !selectedAQDs.includes(aqd.code)
  );

  const handleToggleAQD = (code: string) => {
    const updated = selectedAQDs.includes(code)
      ? selectedAQDs.filter((c) => c !== code)
      : [...selectedAQDs, code];
    setSelectedAQDs(updated);
    onAQDsChange(updated);
  };

  const handleAddCustom = () => {
    if (customAQD.trim() && !selectedAQDs.includes(customAQD.trim())) {
      const updated = [...selectedAQDs, customAQD.trim()];
      setSelectedAQDs(updated);
      onAQDsChange(updated);
      setCustomAQD('');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Additional Qualification Designators (AQDs)
        </h2>
        <p className="text-gray-600">
          Select any AQDs currently in your service record. These will be used to provide tailored
          recommendations.
        </p>
      </div>

      {/* Selected AQDs */}
      {selectedAQDs.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="font-semibold text-green-900 mb-3 flex items-center gap-2">
            <Award className="w-5 h-5" />
            Selected AQDs ({selectedAQDs.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {selectedAQDs.map((code) => {
              const aqd = commonAQDs.find((a) => a.code === code);
              return (
                <div
                  key={code}
                  className="bg-white border border-green-300 rounded-md px-3 py-2 flex items-center gap-2"
                >
                  <span className="font-semibold text-sm text-green-900">{code}</span>
                  {aqd && <span className="text-xs text-green-700">- {aqd.name}</span>}
                  <button
                    onClick={() => handleToggleAQD(code)}
                    className="ml-1 text-green-600 hover:text-green-800"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search */}
      <div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search AQDs by code or name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* AQD List */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 mb-3">Common Medical Corps AQDs</h3>
        <div className="grid md:grid-cols-2 gap-2 max-h-96 overflow-y-auto">
          {filteredAQDs.map((aqd) => (
            <button
              key={aqd.code}
              onClick={() => handleToggleAQD(aqd.code)}
              className="text-left p-3 border border-gray-200 rounded-md hover:bg-blue-50 hover:border-blue-300 transition-colors"
            >
              <div className="font-semibold text-sm text-gray-900">{aqd.code}</div>
              <div className="text-xs text-gray-600">{aqd.name}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Add Custom AQD */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h3 className="font-semibold text-gray-900 mb-2">Add Unlisted AQD</h3>
        <p className="text-sm text-gray-600 mb-3">
          If you have an AQD not listed above, enter the code manually
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Enter AQD code (e.g., JP2)"
            value={customAQD}
            onChange={(e) => setCustomAQD(e.target.value.toUpperCase())}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleAddCustom}
            disabled={!customAQD.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>
      </div>

      {/* Skip Option */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> If you're unsure of your current AQDs, you can skip this step.
          The analysis will still provide valuable career development guidance and recommend AQDs
          you should pursue.
        </p>
      </div>
    </div>
  );
}
