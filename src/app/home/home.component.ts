import { ChangeDetectionStrategy, Component, OnInit, CUSTOM_ELEMENTS_SCHEMA, ChangeDetectorRef, NO_ERRORS_SCHEMA } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import * as SerialPort from 'serialport';
//import * as CryptoJS from 'crypto-js';
//import * as CryptoJS from 'crypto-browserify';
import { PortInfo } from "@serialport/bindings-interface";
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

//const CryptoJS = require('crypto-browserify');
const CryptoJS = require('diffie-hellman/browser');

@Component({
    selector: 'app-home',
    templateUrl: './home.component.html',
    styleUrls: ['./home.component.scss'],
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush, // using OnPush
    imports: [
      TranslateModule,
      CommonModule,
      FormsModule
  ],
  //schemas: [ CUSTOM_ELEMENTS_SCHEMA, NO_ERRORS_SCHEMA ]
})
export class HomeComponent implements OnInit {
  port1: (SerialPort.SerialPort | undefined) = undefined;
  port2: (SerialPort.SerialPort | undefined) = undefined;
  //serialPort: SerialPort.SerialPort;
  serialPortId1: number = -1;
  serialPortId2: number = -1;
  serialPorts: Array<PortInfo> = Array<PortInfo>();
  dh1: (typeof CryptoJS.DiffieHellman | undefined) = undefined;
  dh2: (typeof CryptoJS.DiffieHellman | undefined) = undefined;

  serialPort1BufferReceived: (ArrayBuffer| undefined) = undefined;
  serialPort2BufferReceived: (ArrayBuffer| undefined) = undefined;
  constructor(private ref: ChangeDetectorRef) {
    this.resetSerialPort1();
    this.resetSerialPort2();
    //this.serialPort = window.require('serialport');
  }

  ngOnInit(): void {
    console.log('HomeComponent INIT');
    SerialPort.SerialPort.list().then(ports => {
      //console.log(JSON.stringify(ports));
      ports.forEach(e => {
        if (e.pnpId !== undefined && e.pnpId.search(/uart/i) !== -1) {
          this.serialPorts.push(e);
        } else if (e.path.startsWith("COM")) {
          this.serialPorts.push(e);
        }
      });
      //this.ref.detectChanges();
      this.ref.markForCheck();
    });
  }
/*
  concatenate<A>( ...arrays: A[]): A {
    let totalLength = 0;
    for (const arr of arrays) {
        totalLength += arr.length;
    }
    const result = new A(totalLength);
    let offset = 0;
    for (const arr of arrays) {
        result.set(arr, offset);
        offset += arr.length;
    }
    return result;
  }
*/

  resetSerialPort2() {
    this.serialPort2BufferReceived = new ArrayBuffer(0 , {maxByteLength : 1024 * 1024});
  }
  
  resetSerialPort1() {
    this.serialPort1BufferReceived = new ArrayBuffer(0 , {maxByteLength : 1024 * 1024});
  }

  resetSerialPorts() {
    this.resetSerialPort1();
    this.resetSerialPort2();
  }
  
  startSerialPorts() {
    this.closeSerialPorts();
    
    this.startSerialPort2();
    this.startSerialPort1();
  }

  startSerialPort1 () {
    if (this.serialPortId1 === -1) {
      return;
    }
    if (this.serialPorts[this.serialPortId1] === undefined) {
      return;
    }
    let path: string = this.serialPorts[this.serialPortId1].path;
    this.port1 = new SerialPort.SerialPort({
      path: path,
      baudRate: 115200,
    });
    console.log("Connect to " + path)
    this.port1.on("data", (d: Buffer) => {
      if (this.serialPort1BufferReceived !== undefined) {
        let actualLength: number = this.serialPort1BufferReceived.byteLength;
        this.serialPort1BufferReceived.resize(actualLength + d.byteLength);
        let uint8arr : Uint8Array = new Uint8Array(this.serialPort1BufferReceived);
        uint8arr.set(d, actualLength);
        let dataview4arrbuf : DataView = new DataView(this.serialPort1BufferReceived);
        if (dataview4arrbuf.byteLength > 4) {
          const publicKeyBlen = dataview4arrbuf.getUint16(0);
          const sharedSecretlen = dataview4arrbuf.getUint16(2);
          if (this.serialPort1BufferReceived.byteLength === (2 + 2 + publicKeyBlen + sharedSecretlen)) {
            const publicKeyB : ArrayBuffer = this.serialPort1BufferReceived.slice(4, 4 + publicKeyBlen);
            const sharedSecretSent: ArrayBuffer = this.serialPort1BufferReceived.slice(4 + publicKeyBlen, 4 + publicKeyBlen + sharedSecretlen);
            console.log(JSON.stringify(new Uint8Array(sharedSecretSent)));
            const publicKeyBUint8: Uint8Array = new Uint8Array(publicKeyB);
            const sharedSecret: ArrayBuffer = this.dh1.computeSecret(publicKeyBUint8);
            console.log(JSON.stringify(sharedSecret));
          }
        }
      }
    })
  }

  startSerialPort2 () {
    if (this.serialPortId2 === -1) {
      return;
    }
    if (this.serialPorts[this.serialPortId2] === undefined) {
      return;
    }
    let path: string = this.serialPorts[this.serialPortId2].path;
    this.port2 = new SerialPort.SerialPort({
      path: path,
      baudRate: 115200,
    });
    console.log("Connect to " + path);
    this.port2.on("data", (d: Buffer) => {
      if (this.serialPort2BufferReceived !== undefined) {
        let actualLength: number = this.serialPort2BufferReceived.byteLength;
        this.serialPort2BufferReceived.resize(actualLength + d.byteLength);
        let uint8arr : Uint8Array = new Uint8Array(this.serialPort2BufferReceived);
        uint8arr.set(d, actualLength);
        let dataview4arrbuf : DataView = new DataView(this.serialPort2BufferReceived);
        if (dataview4arrbuf.byteLength > 6) {
          const primelen = dataview4arrbuf.getUint16(0);
          const generatorlen = dataview4arrbuf.getUint16(2);
          const publicKeyAlen = dataview4arrbuf.getUint16(4);
          if (this.serialPort2BufferReceived.byteLength === (2 + 2 + 2 + primelen + generatorlen + publicKeyAlen)) {
            const prime: ArrayBuffer = this.serialPort2BufferReceived.slice(6, 6 + primelen);
            const generator: ArrayBuffer = this.serialPort2BufferReceived.slice(6 + primelen, 6 + primelen + generatorlen);
            const publicKeyA: ArrayBuffer = this.serialPort2BufferReceived.slice(6 + primelen + generatorlen, 6 + primelen + generatorlen + publicKeyAlen);
            this.dh2 = CryptoJS.createDiffieHellman(prime, generator);
            const publicKeyB : ArrayBuffer = this.dh2.generateKeys();
            const publicKeyBlen: number = publicKeyB.byteLength;
            const publicKeyAUint8: Uint8Array = new Uint8Array(publicKeyA);
            const sharedSecret: ArrayBuffer = this.dh2.computeSecret(publicKeyAUint8);
            const sharedSecretlen: number = sharedSecret.byteLength;


            let arrbuf : ArrayBuffer = new ArrayBuffer(2 + 2 + publicKeyBlen + sharedSecretlen);
            let dataview4arrbuf : DataView = new DataView(arrbuf);
            let idx: number = 0;
            dataview4arrbuf.setUint16(idx, publicKeyBlen);
            idx += 2;
            dataview4arrbuf.setUint16(idx, sharedSecretlen);
            idx += 2;
            (new Uint8Array(publicKeyB)).forEach(n => {
              dataview4arrbuf.setUint8(idx, n);
              idx++;
            });
            (new Uint8Array(sharedSecret)).forEach(n => {
              dataview4arrbuf.setUint8(idx, n);
              idx++;
            });
            this.port2?.write(dataview4arrbuf, undefined);
          }
        }
      }
    })
  }

  sendDataSerialPort1 () {
    if (this.port1 === undefined) {
      return;
    }
    this.generateKeyDH_Part1();
    /*
    this.port1.write('main screen turn on', function(err) {
      if (err) {
        console.log('Error on write: ', err.message);
        return;
      }
      console.log('message written');
    });
    */
  }

  closeSerialPorts () {
    if (this.port1 !== undefined) {
      this.port1.close();
      console.log("Close " + this.port1.path);
      this.port1 = undefined;
    }
    if (this.port2 !== undefined) {
      this.port2.close();
      console.log("Close " + this.port2.path);
      this.port2 = undefined;
    }
  }


  generateKeyDH_Part1 () {
    
    //const dhg = CryptoJS.createDiffieHellmanGroup('modp1');
    this.dh1 = CryptoJS.createDiffieHellman(128, 'sd2me');
    const prime : ArrayBuffer = this.dh1.getPrime();
    const primelen : number = prime.byteLength;
    const generator : ArrayBuffer = this.dh1.getGenerator();
    const generatorlen : number = generator.byteLength;
    
    //const dh = CryptoJS.createDiffieHellman(prime, 'hex', generator, 'hex');
    const publicKeyA : ArrayBuffer = this.dh1.generateKeys();
    const privateKeyA : ArrayBuffer = this.dh1.getPrivateKey();
    const publicKeyAlen : number = publicKeyA.byteLength;

    /*
    console.log(JSON.stringify(prime));
    console.log(JSON.stringify(generator));
    console.log(JSON.stringify(publicKeyA));
    */

    let arrbuf : ArrayBuffer = new ArrayBuffer(2 + 2 + 2 + primelen + generatorlen + publicKeyAlen);
    let dataview4arrbuf : DataView = new DataView(arrbuf);
    let idx: number = 0;
    dataview4arrbuf.setUint16(idx, primelen);
    idx += 2;
    dataview4arrbuf.setUint16(idx, generatorlen);
    idx += 2;
    dataview4arrbuf.setUint16(idx, publicKeyAlen);
    idx += 2;
    (new Uint8Array(prime)).forEach(n => {
      dataview4arrbuf.setUint8(idx, n);
      idx++;
    });
    (new Uint8Array(generator)).forEach(n => {
      dataview4arrbuf.setUint8(idx, n);
      idx++;
    });
    (new Uint8Array(publicKeyA)).forEach(n => {
      dataview4arrbuf.setUint8(idx, n);
      idx++;
    });
    this.port1?.write(dataview4arrbuf, undefined);

    /*
    const prime = CryptoJS.DH.getPrime(1024); // Using a 1024-bit prime for demonstration
    const generator = CryptoJS.DH.getGenerator(prime);
    const privateKeyA = CryptoJS.DH.rand(prime); // Your secret private value
    const publicKeyA = CryptoJS.DH.getPublicKey(prime, generator, privateKeyA); // Your public value to share
    */
  }

}