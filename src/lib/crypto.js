const DEFAULT_ITERATIONS = 100000;

function strToArrayBuffer(str) {
  const buf = new ArrayBuffer(str.length * 2);
  const bufView = new Uint16Array(buf);
  for (let i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

function arrayBufferToString(buf) {
  return String.fromCharCode.apply(null, new Uint16Array(buf));
}

function genPBKey(passphrase, salt, iterations) {
  iterations = iterations || DEFAULT_ITERATIONS;
  const saltBuffer = strToArrayBuffer(salt);
  const passphraseKey = strToArrayBuffer(passphrase);
  return window.crypto.subtle.importKey(
    'raw', 
    passphraseKey, 
    {name: 'PBKDF2'}, 
    false, 
    ['deriveBits', 'deriveKey']
  ).then(function(key) {
    return window.crypto.subtle.deriveKey(
      { "name": 'PBKDF2',
        "salt": saltBuffer,
        "iterations": 100,
        "hash": 'SHA-256'
      },
      key,
      {name: 'AES-GCM', length: 256},
      false,
      [ "encrypt", "decrypt" ]
    )
  });
}

function getAlgoEncrypt(passphrase) {
  return {
    name: 'AES-GCM',
    iv: strToArrayBuffer(passphrase),
  };
}

export function encrypt(text, passphrase, salt, iterations){
  iterations = iterations || DEFAULT_ITERATIONS;
  return genPBKey(passphrase, salt)
    .then((key) => {
      return window.crypto.subtle.encrypt(getAlgoEncrypt(passphrase), key, strToArrayBuffer(text));
    })
    .then((cipherText) => {
      return (new Buffer(cipherText)).toString('base64');
    });
}

export function decrypt(b64Text, passphrase, salt){
  const cipher = new Buffer(b64Text, 'base64');
  return genPBKey(passphrase, salt)
    .then((key) => {
      return window.crypto.subtle.decrypt(getAlgoEncrypt(passphrase), key, cipher) ;
    })
    .then((decryptedArray) => {
      const plainText = arrayBufferToString(decryptedArray);
      return plainText;
    })
    .catch((error) => {
      console.log('error decrypting', error)
    })
}
