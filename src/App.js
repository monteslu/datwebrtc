import React, { Component } from 'react';
import './App.css';
import { encrypt, decrypt } from './lib/crypto';

import createOffer, { broadcastOffer } from './lib/createOffer';
import createAnswer from './lib/createAnswer';

import { Button, TextField } from '@material-ui/core';
import { EventEmitter } from 'events';
import config from './config';
import { find, map } from 'lodash';

const styles = {
  text: {
    margin: '8px',
  },
}

//for debugging in console.
global.encrypt = encrypt;
global.decrypt = decrypt;

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
        events,
        myPeerId: config.myId //until https://github.com/beakerbrowser/beaker/issues/1182
      },
      peers: []
    }
    this.localVideoRef = React.createRef();
    this.remoteRefs = {};

    events.on('peerAdded', (msg) => {
      if(!this.remoteRefs[msg.from]) {
        console.log('creating ref for', msg.from);
        this.remoteRefs[msg.from] = React.createRef();
        this.setState({peers: this.state.peers});
      }
      
    });

    events.on('channelMessage', (msg) => {
      console.log('channelMessage', msg);
      this.state.messages.push(msg);
      this.setState({messages: this.state.messages});
    });

    events.on('peerVideoAdded', ({msg, stream}) => {
      if(this.remoteRefs[msg.from].current && !this.remoteRefs[msg.from].current.src) {
        this.remoteRefs[msg.from].current.src = window.URL.createObjectURL(stream);
        this.remoteRefs[msg.from].current.play();
      }
    });

    if(window.experimental) {
      console.log('experimental good, starting up...');
      window.experimental.datPeers.broadcast({message: `hello from ${this.state.me.myPeerId}`});
      window.experimental.datPeers.getSessionData()
        .then((data) => {
          console.log('sessiondata', data);
        });
      window.experimental.datPeers.addEventListener('message', ({datPeer, message}) => {
        console.log('generic message received', message, datPeer);
        const { state } = this;
        if(state.joining) {
          if(message.offer && message.room === state.room && message.from !== state.me.myPeerId) {
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
          else if(message.answer && message.room === state.room && message.from !== state.me.myPeerId && message.answerTo === state.me.myPeerId) {
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
          }
        }

      });
    }


  }

  handleChange = name => event => {
    this.setState({
      [name]: event.target.value,
    });
  };

  handleJoin = () => {
    this.setState({joining: true});
    localStorage.username = this.state.username;
    localStorage.room = this.state.room;
    createOffer(this.state)
      .then((result) => {
        console.log('result', result);
        this.localVideoRef.current.src = result.streamUrl;
        this.localVideoRef.current.play();
      });
    this.setState({connected: true});
  };

  handleSend = () => {
    const msg = {message: this.state.message, username: this.state.username};
    this.state.me.dataChannel.send(JSON.stringify(msg));
    this.state.messages.push(msg);
    this.setState({message: ''});
  };

  render() {
    return (
      <div className="App">
        <header className="App-header">
          WebRTC with dat:// signalling
        </header>

        {this.state.connected ? (
          <div>
            <div>{`Room: ${this.state.room}`}</div>
          </div>
          ) : 
        (<div><TextField
          label="Name"
          value={this.state.username}
          onChange={this.handleChange('username')}
          style={styles.text}
        />
        <TextField
          label="Room Name"
          value={this.state.room}
          onChange={this.handleChange('room')}
          style={styles.text}
        />
        <TextField
          label="Pass Phrase"
          value={this.state.password}
          onChange={this.handleChange('password')}
          style={styles.text}
        />
        <Button 
          variant="contained"
          color="primary" 
          onClick={this.handleJoin}
          disabled={!this.state.username || !this.state.room || !this.state.password || this.state.joining}
        >
          Join
        </Button></div>)}
        <span className="videoSpan">
          <video id="localVideo" ref={this.localVideoRef} />
        </span>
        {map(this.state.peers, (p) => {
          return (
            <span key={p.peerId} id={p.peerId + '_div'} className="videoSpan">
              <video ref={this.remoteRefs[p.peerId]} id={p.peerId} />
            </span>
          )
        })}

        {this.state.connected ? (
          <div className="messageBox">
            <div className="messages">
            {map(this.state.messages, (mess) => {
              return (<div className="messageRow"><span className="messageUser">{mess.username}:</span><span className="messageText">{mess.message}</span></div>)
            })}</div>
            <div className="inputArea">
              <TextField
                label="Message"
                value={this.state.message}
                onChange={this.handleChange('message')}
                style={styles.text}
              />
              <Button 
                variant="contained"
                color="primary" 
                onClick={this.handleSend}
                disabled={!this.state.message}
              >Send</Button>
            </div>
          </div>
          ) : <div/>}
        
      </div>
    );
  }
}

export default App;
