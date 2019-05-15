import React, { Component } from 'react';
import './App.css';
import { encrypt, decrypt } from './lib/crypto';

import createOffer, { broadcastOffer } from './lib/createOffer';
import createAnswer from './lib/createAnswer';

import { Button, TextField } from '@material-ui/core';
import HighlightIcon from '@material-ui/icons/Highlight';
import EyeIcon from '@material-ui/icons/RemoveRedEye';
import { EventEmitter } from 'events';
import config from './config';
import { find, map } from 'lodash';

console.log('starting up 8');

const styles = {
  text: {
    margin: '8px',
  },
  button: {
    margin: '10px'
  },
  icon: {
    marginRight: '5px'
  }
}

//for debugging in console.
global.encrypt = encrypt;
global.decrypt = decrypt;

async function getMyId() {
  return global.experimental && global.experimental.datPeers ? await global.experimental.datPeers.getOwnPeerId() : config.myId;
}

const myPeerId = getMyId();



class App extends Component {
  constructor(props) {
    super(props);
    const events = new EventEmitter();
    this.state = {
      username: localStorage.username || '',
      password: '',
      messages: [],
      message: '',
      room: localStorage.room || '',
      me: {
        peer: new RTCPeerConnection(config.rtc.cfg, config.rtc.options),
        events
      },
      peers: []
    }
    this.localVideoRef = React.createRef();
    this.remoteVideoRef = React.createRef();
    this.remoteRefs = {};

    events.on('peerAdded', (msg) => {
      if(this.state.hosting && !this.remoteRefs[msg.from]) {
        console.log('creating ref for', msg.from);
        this.remoteRefs[msg.from] = React.createRef();
        this.setState({peers: this.state.peers});
        return;
      }
      else if (!this.state.hosting) {
        console.log('creating ref for', msg.from);
        this.remoteRefs.host = React.createRef();
        this.setState({peers: this.state.peers});
      }
      
    });

    events.on('channelMessage', (msg) => {
      console.log('channelMessage', msg);
      this.state.messages.push(msg);
      this.setState({messages: this.state.messages});
    });

    events.on('peerVideoAdded', ({msg, stream}) => {
      
      this.remoteVideoRef.current.src = window.URL.createObjectURL(stream);
      this.remoteVideoRef.current.play();

    });


  }

  startVideo = async () => {
    const { me } = this.state;
    const hdConstraints = {
      video: true,
      audio: true
    };

    return new Promise(async (resolve, reject) => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(hdConstraints);
        const track = stream.getVideoTracks()[0];
        const audioTrack = stream.getAudioTracks()[0];

        console.log({audioTrack: !!audioTrack, track: !!track});

        me.track = track;
        me.stream = stream;
        me.audioTrack = audioTrack;
        if(track) {
          me.peer.addTrack(track, stream);
        }
        if(audioTrack) {
          me.peer.addTrack(audioTrack, stream);
        }
        

        const videoElement = this.localVideoRef.current; // document.createElement('video');
        const cameraCanvas = document.createElement('canvas');

        videoElement.addEventListener('loadeddata', async (e) => {
          cameraCanvas.height = videoElement.videoHeight;
          cameraCanvas.width = videoElement.videoWidth;
          videoElement.height = videoElement.videoHeight;
          videoElement.width = videoElement.videoWidth;

          console.log({video: {height: videoElement.height, width: videoElement.width}});
          
          const ctx = cameraCanvas.getContext('2d');
          await new Promise((res) => {
            // sometimes video take a bit to initialize
            setTimeout(() => res('ok'), 500);
          });
          ctx.drawImage(videoElement, 0, 0, videoElement.videoWidth, videoElement.videoHeight);
          resolve(cameraCanvas.toDataURL());
        });

        const ms = new MediaStream();
        ms.addTrack(track);

        videoElement.srcObject = ms;
        videoElement.load();
        await videoElement.play();
        console.log('setup video', videoElement);
      } catch(err) {
        console.log('video start err', err);
        reject(err);
      }
      
    });

  }

  async componentWillMount() {
    const myPeerId = await getMyId();
    const { me } = this.state;
    me.myPeerId = myPeerId;
    console.log('myPeerId', myPeerId);
    if(window.experimental) {
      console.log('experimental good, starting up...');
      await window.experimental.datPeers.broadcast({message: `hello from ${me.myPeerId}`});
      window.experimental.datPeers.getSessionData()
        .then((data) => {
          console.log('sessiondata', data);
        });
      window.experimental.datPeers.addEventListener('message', ({datPeer, message}) => {
        console.log('generic message received', message, datPeer);
        const { state } = this;
        if(message.room === state.room && message.from !== state.me.myPeerId) {
          if(state.joining && message.answer && message.answerTo === state.me.myPeerId) {
          
            decrypt(message.answer, state.password, message.uuid)
              .then((answer) => {
                console.log('answer recieved');
                
                const remotePeer = find(state.peers, { peerId: message.from });
                if(remotePeer) {
                  console.log('already have that peer');
                  return;
                }
                state.peers.push({peerId: message.from});
                const answerDesc = new RTCSessionDescription(JSON.parse(answer));
                state.me.peer.setRemoteDescription(answerDesc);
              });
            
          } else if (state.hosting && message.offer) {
  
            createAnswer(message, state)
              .then((peer) => {
                state.peers.push(peer);
  
                const remotePeer = find(state.peers, { peerId: message.from });
                if(remotePeer && !remotePeer.reOffered) {
                  remotePeer.reOffered = true;
                  //after answering, make another offer for them to answer.
                  broadcastOffer(state.me, state.room, state.password);
                }
                
              })
          }
        }
        

      });
    }

    me.events.on('dataChannelReady', () => {
      this.setState({dataChannelReady: true});
    });                   

  }

  handleChange = name => event => {
    this.setState({
      [name]: event.target.value,
    });
  };

  handleJoin = async () => {
    this.setState({joining: true});
    localStorage.username = this.state.username;
    localStorage.room = this.state.room;
    this.state.me.cameraShot = await this.startVideo();
    
    const result = createOffer(this.state);
    this.setState({connected: true});
  };

  handleHost = async () => {
    this.setState({hosting: true});
    localStorage.username = this.state.username;
    localStorage.room = this.state.room;
    this.state.me.cameraShot = await this.startVideo();
    
    this.setState({connected: true});
  };

  handleSend = () => {
    const msg = {message: this.state.message, username: this.state.username};
    this.state.me.dataChannel.send(JSON.stringify(msg));
    this.state.messages.push(msg);
    this.setState({message: ''});
  };

  render() {
    const { state } = this;
    return (
      <div className="App">
        <header className="App-header">
          WebRTC with dat:// signalling
        </header>

        {state.connected ? (
          <div>
            <div>{`${state.hosting ? 'Hosting ' : ''}Room: ${state.room}`}</div>
          </div>
          ) : 
        (<div><TextField
          label="Name"
          value={state.username}
          onChange={this.handleChange('username')}
          style={styles.text}
        />
        <TextField
          label="Room Name"
          value={state.room}
          onChange={this.handleChange('room')}
          style={styles.text}
        />
        <TextField
          label="Pass Phrase"
          value={state.password}
          onChange={this.handleChange('password')}
          style={styles.text}
        />
        <Button
          style={styles.button}
          variant="contained"
          color="primary" 
          onClick={this.handleHost}
          disabled={!state.username || !state.room || !state.password || state.joining || state.hosting}
        >
          <HighlightIcon style={styles.icon}/> Create Room
        </Button>
        <Button
          style={styles.button}
          variant="contained"
          color="primary" 
          onClick={this.handleJoin}
          disabled={!state.username || !state.room || !state.password || state.joining || state.hosting}
        >
          <EyeIcon style={styles.icon}/> Join Room
        </Button>
        </div>)}
        <span className="videoSpan">
          <video id="localVideo" ref={this.localVideoRef} />
        </span>
        <span id={'peer_div'} className="videoSpan">
          <video ref={this.remoteVideoRef} id="remoteVideo" />
        </span>

        {state.dataChannelReady ? (
          <div className="messageBox">
            <div className="messages">
            {map(state.messages, (mess) => {
              return (<div className="messageRow"><span className="messageUser">{mess.username}:</span><span className="messageText">{mess.message}</span></div>)
            })}</div>
            <div className="inputArea">
              <TextField
                label="Message"
                value={state.message}
                onChange={this.handleChange('message')}
                style={styles.text}
              />
              <Button 
                variant="contained"
                color="primary" 
                onClick={this.handleSend}
                disabled={!state.message}
              >Send</Button>
            </div>
          </div>
          ) : <div/>}
        
      </div>
    );
  }
}

export default App;
