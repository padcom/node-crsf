#!/usr/bin/env node

const Parser = require('binary-parser').Parser
const { struct, union, sizeOf } = require('@thi.ng/unionstruct')

const SerialPort = require('serialport')
const port = new SerialPort('/dev/ttyUSB0', {
  baudRate: 400000
})

Buffer.prototype.toArrayBuffer = function() {
  var ab = new ArrayBuffer(this.length);
  var view = new Uint8Array(ab);
  for (var i = 0; i < this.length; ++i) {
      view[i] = this[i];
  }
  return ab;
}

/**
 * CRC8 implementation with polynom = x7+ x6+ x4+ x2+ x0 (0xD5)
 */
function crc8(buffer) {
  const crc8tab = [
    0x00, 0xD5, 0x7F, 0xAA, 0xFE, 0x2B, 0x81, 0x54, 0x29, 0xFC, 0x56, 0x83, 0xD7, 0x02, 0xA8, 0x7D,
    0x52, 0x87, 0x2D, 0xF8, 0xAC, 0x79, 0xD3, 0x06, 0x7B, 0xAE, 0x04, 0xD1, 0x85, 0x50, 0xFA, 0x2F,
    0xA4, 0x71, 0xDB, 0x0E, 0x5A, 0x8F, 0x25, 0xF0, 0x8D, 0x58, 0xF2, 0x27, 0x73, 0xA6, 0x0C, 0xD9,
    0xF6, 0x23, 0x89, 0x5C, 0x08, 0xDD, 0x77, 0xA2, 0xDF, 0x0A, 0xA0, 0x75, 0x21, 0xF4, 0x5E, 0x8B,
    0x9D, 0x48, 0xE2, 0x37, 0x63, 0xB6, 0x1C, 0xC9, 0xB4, 0x61, 0xCB, 0x1E, 0x4A, 0x9F, 0x35, 0xE0,
    0xCF, 0x1A, 0xB0, 0x65, 0x31, 0xE4, 0x4E, 0x9B, 0xE6, 0x33, 0x99, 0x4C, 0x18, 0xCD, 0x67, 0xB2,
    0x39, 0xEC, 0x46, 0x93, 0xC7, 0x12, 0xB8, 0x6D, 0x10, 0xC5, 0x6F, 0xBA, 0xEE, 0x3B, 0x91, 0x44,
    0x6B, 0xBE, 0x14, 0xC1, 0x95, 0x40, 0xEA, 0x3F, 0x42, 0x97, 0x3D, 0xE8, 0xBC, 0x69, 0xC3, 0x16,
    0xEF, 0x3A, 0x90, 0x45, 0x11, 0xC4, 0x6E, 0xBB, 0xC6, 0x13, 0xB9, 0x6C, 0x38, 0xED, 0x47, 0x92,
    0xBD, 0x68, 0xC2, 0x17, 0x43, 0x96, 0x3C, 0xE9, 0x94, 0x41, 0xEB, 0x3E, 0x6A, 0xBF, 0x15, 0xC0,
    0x4B, 0x9E, 0x34, 0xE1, 0xB5, 0x60, 0xCA, 0x1F, 0x62, 0xB7, 0x1D, 0xC8, 0x9C, 0x49, 0xE3, 0x36,
    0x19, 0xCC, 0x66, 0xB3, 0xE7, 0x32, 0x98, 0x4D, 0x30, 0xE5, 0x4F, 0x9A, 0xCE, 0x1B, 0xB1, 0x64,
    0x72, 0xA7, 0x0D, 0xD8, 0x8C, 0x59, 0xF3, 0x26, 0x5B, 0x8E, 0x24, 0xF1, 0xA5, 0x70, 0xDA, 0x0F,
    0x20, 0xF5, 0x5F, 0x8A, 0xDE, 0x0B, 0xA1, 0x74, 0x09, 0xDC, 0x76, 0xA3, 0xF7, 0x22, 0x88, 0x5D,
    0xD6, 0x03, 0xA9, 0x7C, 0x28, 0xFD, 0x57, 0x82, 0xFF, 0x2A, 0x80, 0x55, 0x01, 0xD4, 0x7E, 0xAB,
    0x84, 0x51, 0xFB, 0x2E, 0x7A, 0xAF, 0x05, 0xD0, 0xAD, 0x78, 0xD2, 0x07, 0x53, 0x86, 0x2C, 0xF9
  ]

  let crc = 0
  for (let i = 0; i < buffer.length; i++) {
    crc = crc8tab[crc ^ buffer.readUInt8(i)]
  }

  return crc;
}


let prev = 0

port.on('data', data => {
  if (data.byteLength < 2) return
  // console.log('DATA LENGTH:', data.byteLength)

  const device = data.readUInt8(0)
  const frameSize = data.readUInt8(1)

  if (frameSize + 2 > data.byteLength) {
    // console.log('BROKEN FRAME')
    return
  }

  const type = data.readUInt8(2)

  const payload = data.slice(3, data.byteLength - 1)
  const crc = data.readUInt8(data.byteLength - 1)

  // console.log('DEVICE:', device.toString(16), '; PAYLOAD SIZE:', frameSize, '; TYPE:', type.toString(16),'; CRC:', crc.toString(16))
  // console.log('PAYLOAD:', payload.toString('hex'))

  // if (type === 0x14) {
  //   const uplinkRSSIAnt1 = payload.readUInt8(0)
  //   const uplinkRSSIAnt2 = payload.readUInt8(1)
  //   const linkQuality = payload.readUInt8(2)
  //   const uplinkSnR = payload.readUInt8(3)
  //   const activeDiversityAntena = payload.readUInt8(4)
  //   const rfMode = payload.readUInt8(5)

  //   console.log(
  //     'ant1', uplinkRSSIAnt1, ', ant2', uplinkRSSIAnt2,
  //     'lq', linkQuality,
  //     'snr', uplinkSnR,
  //     'diversity', activeDiversityAntena,
  //     'mode', rfMode
  //   )
  // }

  if (type === 0x16) {
    const bytes = []
    for (let i = 0; i < payload.byteLength; i++) {
      let bits = payload.readUInt8(i).toString(2)
      while (bits.length < 8) bits = '0' + bits
      bytes.push(bits)
    }
    const packed = bytes.join('')

    console.log()
    // console.log('PACKED             11111 11111 22222 22222 33333 33333 44444 44444 55555 55555 66666 66666 77777 77777 88888')
    // console.log('PACKED 01234 56789 01234 56789 01234 56789 01234 56789 01234 56789 01234 56789 01234 56789 01234 56789 01234')
    console.log('PACKED 44444 44444 55555 55555 66666 66666 77777 77777 88888 88888 99999 99999 00000 00000 11111 11111 22222 22222 33333 33333 44444 44444 55555')
    console.log('PACKED 01234 56789 01234 56789 01234 56789 01234 56789 01234 56789 01234 56789 01234 56789 01234 56789 01234 56789 01234 56789 01234 56789 01234')
    // @ts-ignore
    console.log('PACKED', packed.substr(40, 115).match(/.{1,5}/g).join(' '))

    const channels = [
      /* 1 */ packed.substr(13, 3) + packed.substr(0, 8),
      /* 2 */ packed.substr(18, 6) + packed.substr(8, 5),
      /* 3 */ packed.substr(39, 1) + packed.substr(24, 8) + packed.substr(16, 2),
      /* 4 */ packed.substr(44, 4) + packed.substr(32, 7),
      /* 5 */ packed.substr(49, 7) + packed.substr(40, 4),
      /* 6 */ packed.substr(70, 2) + packed.substr(56, 8) + packed.substr(48, 1),
      /* 7 */ packed.substr(75, 5) + packed.substr(64, 6),
      /* 8 */ packed.substr(80, 8) + packed.substr(72, 3),
      /* 9 */ packed.substr(101, 3) + packed.substr(88, 8),
      /* 10 */ packed.substr(106, 6) + packed.substr(96, 5),
      /* 11 */ packed.substr(127, 1) + packed.substr(112, 8) + packed.substr(104, 2),
      /* 12 */ packed.substr(132, 4) + packed.substr(120, 7),
      /* 13 */ packed.substr(137, 7) + packed.substr(128, 4),
      /* 14 */ packed.substr(158, 2) + packed.substr(144, 8) + packed.substr(146, 1),
      /* 15 */ packed.substr(163, 5) + packed.substr(152, 6),
      /* 16 */ packed.substr(168, 8) + packed.substr(160, 3),
    ]

    // console.log('CHANNELS', channels.map(x => x.length + ' ' + x).join(' '))

    console.log('CHANNELS', channels
      .map(value => parseInt(value, 2))
      .map(value => Math.round((value - 992) * 5 / 8 + 1500))
      .join(' ')
    )
  }
})
