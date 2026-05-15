require('dotenv').config({ path: '../.env' });

const mqtt = require('mqtt');

console.log('USER=', process.env.MQTT_USERNAME);
console.log('PASS=', process.env.MQTT_PASSWORD);

const client = mqtt.connect(process.env.MQTT_BROKER || 'mqtt://localhost:1883', {
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
});

client.on('connect', () => {
    console.log('✅ Connected to MQTT');
    client.subscribe('vitals/#', () => {
        console.log('📡 Subscribed to vitals/#');
    });
});

client.on('error', (err) => {
    console.log('❌ MQTT error:', err.message);
});

client.on('message', (topic, message) => {
    console.log('📥 topic=', topic);
    console.log('📥 payload=', message.toString());
    console.log('----------------------');
});