const state = {
    connected: false,
    messages_total: 0,
    messages_failed: 0,
    last_message_at: null,
    last_error_at: null,
    last_error_message: null,
    subscribed_topic: null,
};

const setConnected = (connected) => {
    state.connected = Boolean(connected);
};

const setSubscribedTopic = (topic) => {
    state.subscribed_topic = topic || null;
};

const markMessageSuccess = () => {
    state.messages_total += 1;
    state.last_message_at = new Date().toISOString();
};

const markMessageFailure = (errorMessage) => {
    state.messages_failed += 1;
    state.last_error_at = new Date().toISOString();
    state.last_error_message = errorMessage || 'unknown_error';
};

const getMqttRuntimeStatus = () => ({ ...state });

module.exports = {
    setConnected,
    setSubscribedTopic,
    markMessageSuccess,
    markMessageFailure,
    getMqttRuntimeStatus,
};
