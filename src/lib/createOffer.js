import uuidv4 from 'uuid/v4';
import { encrypt } from './crypto';

import config from '../config';

function onsignalingstatechange (state) {
  console.info('offerer/host signaling state change:', state)
}

function oniceconnectionstatechange (state) {
  console.info('offerer/host ice connection state change:', state)
}

function onicegatheringstatechange (state) {
  console.info('offerer/host ice gathering state change:', state)
}


export function broadcastOffer(me, room, password) {
  const uuid = (uuidv4() + uuidv4()).split('-').join('');
              
  return encrypt(JSON.stringify(me.peer.localDescription), password, uuid)
  .then((offer) => {
    const msg = {offer, uuid, from: me.myPeerId, room };
    console.log('broadcasting offer msg', msg);
    if(window.experimental) {
      window.experimental.datPeers.broadcast(msg);
    }
    return msg;
  });
}

export default function createLocalOffer ({room, password, me}) {

  return new Promise((resolve, reject) => {
    const retVal = {};

    me.peer.onaddstream = (e) => {
     console.log('Got remote stream from answerer/host', e.stream, e)
      setTimeout(() => {
        //hack to make sure video element and ref created;
        me.events.emit('peerVideoAdded', {room, stream: e.stream});
      }, 1500);
      me.events.emit('streamAdded', e);
    }

    me.peer.onaddtrack= (e) => {
      console.log('Got remote TRACK from answerer/host', e.stream, e)
     
      me.events.emit('trackAdded', e);
    }

    me.peer.onconnection = (e) => {
      console.log('me peer onconnect', e);
    }

    // create data channel...............
    try {
      me.dataChannel = me.peer.createDataChannel('test', {reliable: true});
      me.dataChannel.onopen = function (e) {
        me.events.emit('dataChannelReady', e);
        console.log('data channel connect', e);
        me.dataChannel.send(JSON.stringify({message: 'hello from offerer!'}));
        me.events.emit('peerCreated', {});
      }
      me.dataChannel.onmessage = function (e) {
        console.log('Got message (pc1)', e.data)
        if (e.data.charCodeAt(0) === 2) {
          // The first message we get from Firefox (but not Chrome)
          // is literal ASCII 2 and I don't understand why -- if we
          // leave it in, JSON.parse() will barf.
          return;
        }
        console.log(e)
        var data = JSON.parse(e.data)
        console.log(data.message);
        if(data.username) {
          me.events.emit('channelMessage', data);
        }
      }
    } catch (e) { 
      console.warn('No data channel (pc1)', e); 
      reject(e);
    }

    me.peer.createOffer(config.sdpConstraints)
      .then((desc) => {
        return me.peer.setLocalDescription(desc);
      })
      .then(() => {

        me.peer.onicecandidate = function (e) {
          // console.log('ICE candidate (pc1)', e)
          if (e.candidate == null) {
            broadcastOffer(me, room, password)
            .then((offer) => {
              resolve(retVal);
            });
            
          }
        }

      });

    me.peer.onsignalingstatechange = onsignalingstatechange;
    me.peer.oniceconnectionstatechange = oniceconnectionstatechange;
    me.peer.onicegatheringstatechange = onicegatheringstatechange;
    

  });
  

}
