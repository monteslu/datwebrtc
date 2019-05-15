import uuidv4 from 'uuid/v4';
import { encrypt, decrypt } from './crypto';
import config from '../config';


function onsignalingstatechange (state) {
  console.info('answerer/joiner signaling state change:', state)
}

function oniceconnectionstatechange (state) {
  console.info('answerer/joiner ice connection state change:', state)
}

function onicegatheringstatechange (state) {
  console.info('answerer/joiner ice gathering state change:', state)
}


export default function createAnswer (msg, {room, password, me}) {
  return new Promise((resolve, reject) => {

    decrypt(msg.offer, password, msg.uuid)
      .then((decryptedOffer) => {

        const offerDesc = new RTCSessionDescription(JSON.parse(decryptedOffer));
        const { peer } = me;
        const remotePeer = {
          peer,
          peerId: msg.from
        };
        peer.onaddstream = (e) => {
          me.events.emit('peerAdded', msg);
          console.log('Got remote stream from offerer/joiner', e.stream, e);
          setTimeout(() => {
            //hack to make sure video element and ref created;
            me.events.emit('peerVideoAdded', {msg, stream: e.stream});
          }, 500);
        }

        peer.onaddtrack= (e) => {
          console.log('Got remote TRACK from offerer/joiner', e.stream, e)
          me.events.emit('trackAdded', e);
        }

        peer.onconnection = (e) => {
          console.log('peer onconnect', e);
        }
        peer.setRemoteDescription(offerDesc);
        peer.createAnswer(config.sdpConstraints)
          .then((answerDesc) => {
            peer.setLocalDescription(answerDesc);

            peer.onicecandidate = function (e) {
              // console.log('ICE candidate (pc2)', e)
              if (e.candidate == null) {
                const uuid = (uuidv4() + uuidv4()).split('-').join('');
                encrypt(JSON.stringify(peer.localDescription), password, uuid)
                .then((answer) => {
                  const answerMsg = {answer, uuid, from: me.myPeerId, room, answerTo: msg.from };
                  console.log('answer msg', answerMsg);

                  peer.ondatachannel = function (e) {
                    const datachannel = e.channel || e; // Chrome sends event, FF sends raw channel
                    // console.log('Received datachannel (pc2)', arguments)

                    me.dataChannel = datachannel;
                    
                    datachannel.onopen = function (e) {
                      console.log('data channel connect from remote peer', e);
                      me.events.emit('dataChannelReady', e);
                      datachannel.send(JSON.stringify({message: 'hello from answerer!'}));
                      me.events.emit('peerCreated', {});
                    }
                    datachannel.onmessage = function (e) {
                      console.log('Got message (pc2)', e.data);
                      console.log(e)
                      if (e.data.charCodeAt(0) === 2) {
                        // The first message we get from Firefox (but not Chrome)
                        // is literal ASCII 2 and I don't understand why -- if we
                        // leave it in, JSON.parse() will barf.
                        return;
                      }
                      var data = JSON.parse(e.data);
                      if(data.username) {
                        me.events.emit('channelMessage', data);
                      }
                      console.log(data.message);
                      
                    }

                  }

                  peer.onsignalingstatechange = onsignalingstatechange;
                  peer.oniceconnectionstatechange = oniceconnectionstatechange;
                  peer.onicegatheringstatechange = onicegatheringstatechange;

                  window.experimental.datPeers.broadcast(answerMsg);


                  resolve(remotePeer);
                });
                
              }
            }

          })

      })

  });

}
