const toFiniteNumber = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
};

const calculateAge = (dateOfBirth) => {
    if (!dateOfBirth) return null;
    const birthDate = new Date(dateOfBirth);
    if (Number.isNaN(birthDate.getTime())) return null;

    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age -= 1;
    }
    return age >= 0 ? age : null;
};

const calculateBmi = (weightKg, height) => {
    const weight = toFiniteNumber(weightKg);
    const rawHeight = toFiniteNumber(height);
    if (!weight || !rawHeight) return null;

    const heightM = rawHeight > 3 ? rawHeight / 100 : rawHeight;
    if (heightM <= 0) return null;

    return weight / (heightM * heightM);
};

const calculateMap = (systolicBp, diastolicBp) => {
    const systolic = toFiniteNumber(systolicBp);
    const diastolic = toFiniteNumber(diastolicBp);
    if (!systolic || !diastolic) return null;

    return (systolic + 2 * diastolic) / 3;
};

const normalizeGender = (gender) => {
    const value = String(gender || '').trim().toLowerCase();
    if (!value) return null;
    if (['female', 'f', 'nu', 'nữ', '0'].includes(value)) return 0;
    if (['male', 'm', 'nam', '1'].includes(value)) return 1;
    return null;
};

const standardScale = (values, scaler) => {
    if (!Array.isArray(values) || !scaler?.mean || !scaler?.scale) {
        return null;
    }
    if (values.length !== scaler.mean.length || values.length !== scaler.scale.length) {
        return null;
    }

    return values.map((value, index) => {
        const n = toFiniteNumber(value);
        const mean = toFiniteNumber(scaler.mean[index]);
        const scale = toFiniteNumber(scaler.scale[index]);
        if (n === null || mean === null || !scale) return null;
        return (n - mean) / scale;
    });
};

const median = (values) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const standardDeviation = (values) => {
    if (!values.length) return null;
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / values.length;
    return Math.sqrt(variance);
};

const selectPeakCenteredWindow = (numeric, windowSize) => {
    const half = Math.floor(windowSize / 2);
    const lastCenter = numeric.length - (windowSize - half);

    if (numeric.length === windowSize) {
        return {
            window: numeric,
            start: 0,
            peakIndex: half,
            selection: 'exact_window',
        };
    }

    if (lastCenter < half) return null;

    const baseline = median(numeric) ?? 0;
    let peakIndex = half;
    let peakScore = -Infinity;

    // Training beats are centered on annotated R-peaks. For live data we do not
    // have annotations, so choose the strongest deflection that can be centered.
    for (let i = half; i <= lastCenter; i += 1) {
        const score = Math.abs(numeric[i] - baseline);
        if (score > peakScore) {
            peakScore = score;
            peakIndex = i;
        }
    }

    const start = peakIndex - half;
    return {
        window: numeric.slice(start, start + windowSize),
        start,
        peakIndex,
        selection: 'peak_centered',
    };
};

const assessEcgQuality = (numeric, selected, { windowSize, samplingRate, expectedSamplingRate }) => {
    const windowStd = standardDeviation(selected?.window || []);
    const baseline = median(numeric) ?? 0;
    const peakAmplitude = selected ? Math.abs(numeric[selected.peakIndex] - baseline) : null;
    const samplingRateRatio = samplingRate && expectedSamplingRate
        ? samplingRate / expectedSamplingRate
        : null;

    const issues = [];
    if (numeric.length < windowSize) issues.push('too_few_points');
    if (windowStd !== null && windowStd < 0.02) issues.push('flat_or_low_variance_signal');
    if (peakAmplitude !== null && windowStd && peakAmplitude / windowStd < 2) issues.push('weak_peak');
    if (samplingRateRatio !== null && (samplingRateRatio < 0.9 || samplingRateRatio > 1.1)) {
        issues.push('sampling_rate_mismatch');
    }

    return {
        points_count: numeric.length,
        window_size: windowSize,
        selected_start: selected?.start ?? null,
        selected_peak_index: selected?.peakIndex ?? null,
        selection: selected?.selection ?? null,
        sampling_rate: samplingRate || null,
        expected_sampling_rate: expectedSamplingRate || null,
        window_std: windowStd,
        peak_amplitude: peakAmplitude,
        issues,
        usable: issues.length === 0,
    };
};

const buildEcgWindow = (points, { windowSize, mean, std, samplingRate = null, expectedSamplingRate = null }) => {
    if (!Array.isArray(points) || !windowSize || !std) return null;

    const numeric = points
        .map((value) => toFiniteNumber(value))
        .filter((value) => value !== null);

    if (numeric.length < windowSize) return null;

    const selected = selectPeakCenteredWindow(numeric, windowSize);
    if (!selected || selected.window.length !== windowSize) return null;

    const quality = assessEcgQuality(numeric, selected, { windowSize, samplingRate, expectedSamplingRate });

    return {
        window: selected.window.map((value) => [(value - mean) / std]),
        raw_window: selected.window,
        quality,
    };
};

const normalizeEcgWindow = (points, options) => {
    const result = buildEcgWindow(points, options);
    return result?.window || null;
};

module.exports = {
    toFiniteNumber,
    calculateAge,
    calculateBmi,
    calculateMap,
    normalizeGender,
    standardScale,
    buildEcgWindow,
    normalizeEcgWindow,
};
