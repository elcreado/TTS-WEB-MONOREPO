import React, { useState, useEffect } from 'react';
import defaultConfig from '../../data/config.json';

interface ConfigData {
    tiktok: {
        username: string;
    };
    readChat: { enabled: boolean };
    readGifts: { enabled: boolean };
    readFollows: { enabled: boolean };
    readShares: { enabled: boolean };
    readJoins?: { enabled: boolean };
}

interface ConfigSectionProps {
    onSave: (config: ConfigData) => void;
    currentConfig?: ConfigData | null;
    onClose?: () => void; // Optional close handler if needed
}

const ConfigSection: React.FC<ConfigSectionProps> = ({ onSave, currentConfig, onClose }) => {
    // Initialize state with props or default config
    const [config, setConfig] = useState<ConfigData>(() => {
        return {
            ...defaultConfig,
            readJoins: { enabled: false },
            ...(currentConfig || {})
        } as ConfigData;
    });

    // Update local state if currentConfig changes from parent
    useEffect(() => {
        if (currentConfig) {
            setConfig(prev => ({
                ...prev,
                ...currentConfig
            }));
        }
    }, [currentConfig]);

    const handleToggle = (section: keyof ConfigData) => {
        setConfig(prev => {
            const currentSection = prev[section] as { enabled: boolean };
            return {
                ...prev,
                [section]: { enabled: !currentSection.enabled }
            };
        });
    };

    const handleSave = () => {
        onSave(config);
        if (onClose) onClose();
    };

    // Helper to render a toggle switch
    const renderToggle = (label: string, sectionKey: keyof ConfigData) => {
        const isEnabled = (config[sectionKey] as { enabled: boolean })?.enabled ?? false;

        return (
            <div className="toggle-item">
                <span className="toggle-label">{label}</span>
                <label className="switch">
                    <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={() => handleToggle(sectionKey)}
                    />
                    <span className="slider"></span>
                </label>
            </div>
        );
    };

    return (
        <div className="config-content">
            <div className="config-header">
                <h2>Configuration</h2>
                {onClose && (
                    <button
                        onClick={onClose}
                        style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '1.2rem', cursor: 'pointer' }}
                    >
                        ✕
                    </button>
                )}
            </div>

            <div className="config-toggles">
                {renderToggle("Read Chat", "readChat")}
                {renderToggle("Read Gifts", "readGifts")}
                {renderToggle("Read Follows", "readFollows")}
                {renderToggle("Read Shares", "readShares")}
                {renderToggle("Read Joins", "readJoins")}
            </div>

            <div className="config-actions">
                <button className="btn-save-config" onClick={handleSave}>
                    Save Changes
                </button>
            </div>
        </div>
    );
};

export default ConfigSection;
