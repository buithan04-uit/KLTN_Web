exports.up = (pgm) => {
    pgm.addColumns('users', {
        first_name:            { type: 'text' },
        last_name:             { type: 'text' },
        date_of_birth:         { type: 'date' },
        blood_type:            { type: 'varchar(5)' },   // A+, A-, B+, B-, AB+, AB-, O+, O-
        height:                { type: 'decimal(5,2)' }, // cm
        weight:                { type: 'decimal(5,2)' }, // kg
        underlying_conditions: { type: 'text' },         // bệnh nền, free text
        avatar_url:            { type: 'text' },         // đường dẫn ảnh đại diện
    });
};

exports.down = (pgm) => {
    pgm.dropColumns('users', [
        'first_name', 'last_name', 'date_of_birth', 'blood_type',
        'height', 'weight', 'underlying_conditions', 'avatar_url',
    ]);
};
