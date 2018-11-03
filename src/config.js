import uuidv4 from 'uuid/v4';

const sdpConstraints = {
  optional: [],
  mandatory: {
    OfferToReceiveAudio: true,
    OfferToReceiveVideo: true
  }
};

const config = {
  rtc : {
    cfg : {'iceServers': [{'url': 'stun:stun.l.google.com:19302'}]},
    options : { 'optional': [{'DtlsSrtpKeyAgreement': true}] }
  },
  sdpConstraints,
  myId : (uuidv4() + uuidv4()).split('-').join('')

};

export default config;