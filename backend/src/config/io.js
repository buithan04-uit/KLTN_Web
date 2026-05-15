/**
 * IO singleton — lets controllers emit socket events without requiring
 * the `io` instance to be threaded through every request/middleware.
 *
 * Usage:
 *   Backend entry-point (index.js):  setIO(io)
 *   Any controller / service:        getIO()?.to('room').emit('event', data)
 */

let _io = null;

module.exports = {
    setIO: (io) => { _io = io; },
    getIO: () => _io,
};
