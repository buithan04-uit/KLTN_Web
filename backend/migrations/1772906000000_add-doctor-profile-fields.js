/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.up = (pgm) => {
    pgm.addColumns('users', {
        specialty:      { type: 'text' }, // doctor: chuyên khoa
        license_number: { type: 'text' }, // doctor: số chứng chỉ hành nghề
        workplace:      { type: 'text' }, // doctor: nơi công tác
        bio:            { type: 'text' }, // doctor/admin: giới thiệu bản thân
        department:     { type: 'text' }, // admin: phòng ban
    });
};

exports.down = (pgm) => {
    pgm.dropColumns('users', ['specialty', 'license_number', 'workplace', 'bio', 'department']);
};
