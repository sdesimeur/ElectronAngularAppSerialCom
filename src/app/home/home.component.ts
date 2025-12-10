import { ChangeDetectionStrategy, Component, OnInit, CUSTOM_ELEMENTS_SCHEMA, ChangeDetectorRef, NO_ERRORS_SCHEMA, OnDestroy, HostListener } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import * as SerialPort from 'serialport';
import * as CryptoJS from 'crypto-js';
//import * as CryptoJS from 'crypto-browserify';
import { PortInfo } from "@serialport/bindings-interface";
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { LocalStorageService } from 'ngx-webstorage';
import * as elliptic from 'elliptic';
import { Key } from 'readline';

//const CryptoJS = require('crypto-browserify');
const textEnc = new TextEncoder();
const textDec = new TextDecoder();
// Install: npm install elliptic
const EC = elliptic.ec;
/*
Alice speak to Bob

https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey#ecdh

*/
enum KeyToUse {
  SESSION,
  SYSTEM
};

class KeysAndSerialPortClass {
  dhKeys: (CryptoKeyPair | undefined) = undefined;
  systemKey: (CryptoKey| undefined) = undefined;
  sharedSecret: (CryptoKey| undefined) = undefined;
  sharedSecretDerivedHKDF: (CryptoKey| undefined) = undefined;
  serialportBufferReceived: (ArrayBuffer| undefined) = undefined;
  serialPortId: number = 0;
  port: (SerialPort.SerialPort | undefined) = undefined;
  initialVector: ArrayBuffer = new ArrayBuffer(16);
  salt: ArrayBuffer = new ArrayBuffer(16);
  info: ArrayBuffer = new ArrayBuffer(16);
  name: string = "";
  sendPublicKeyDone: boolean = false;
  
  constructor(name: string, private home: HomeComponent, private localStorage: LocalStorageService) {
    this.name = name;
    const wa = CryptoJS.enc.Hex.parse(INITIAL_VECTOR);
    let iv: DataView = new DataView(this.initialVector);
    iv.setUint32(0, wa.words[0], true);
    iv.setUint32(4, wa.words[1], true);
    iv.setUint32(8, wa.words[2], true);
    iv.setUint32(12, wa.words[3], true);
    this.info = this.initialVector;
    this.salt = this.initialVector;
    this.generateKeys();
  }

  keyToEncrypt(key: KeyToUse): CryptoKey|undefined {
    if (key === KeyToUse.SESSION) {
      return this.sharedSecretDerivedHKDF;
    } else {
      return this.systemKey;
    }

  }

  async systemKeyExport () : Promise<ArrayBuffer | undefined> {
    if (this.systemKey === undefined) {
      return undefined;
    } else {
      return await window.crypto.subtle.exportKey("raw", this.systemKey);
    }
  }

  closeSerialPort () {
    if (this.port !== undefined) {
      if (this.port.isOpen) {
        this.port.close();
        this.home.consoleHTML = "Close " + this.port.path
        this.port = undefined;
      }
    }
  }

  async generateKeys () {
    this.dhKeys = await window.crypto.subtle.generateKey(
      {
        name: "ECDH",
        namedCurve: "P-256",
      },
      false,
      ["deriveKey"],
    );
  }

  deriveSecretKey(privateKey: CryptoKey, publicKey: CryptoKey) {
    return window.crypto.subtle.deriveKey(
      {
        name: "ECDH",
        public: publicKey,
      },
      privateKey,
      {
        name: "AES-CBC",
        length: 256,
      },
      true,
      ["encrypt", "decrypt"],
    );
  }

  async sendPublicKey () {
    if (this.sendPublicKeyDone) return;
    this.sendPublicKeyDone = true;
  
    this.home.consoleHTML = "";
    if (this.dhKeys !== undefined) {
      const temp = (await window.crypto.subtle.exportKey("raw", this.dhKeys.publicKey)).slice(1);
      this.sendDataOnPort(DataType.PUBLIC_KEY_ECDH, temp);
    }
  }

  async handleReceivePublicKey(publicKey: ArrayBuffer) {
    if (this.dhKeys === undefined) {
      this.home.consoleHTML = "<p style='color:reduce;'><b>Something is wrong</b></p>"
    } else {
      this.home.consoleHTML = JSON.stringify(new Buffer(publicKey));
      const publicKey_Key : CryptoKey = await window.crypto.subtle.importKey(
        "raw",
        publicKey,
        {
          name: "ECDH",
          namedCurve: "P-256"
        },
        false,
        []
      );
      this.sharedSecret = await this.deriveSecretKey(this.dhKeys.privateKey, publicKey_Key);
      const temp: CryptoKey = await window.crypto.subtle.importKey(
        "raw",
        await window.crypto.subtle.exportKey("raw", this.sharedSecret),
        "HKDF",
        false,
        ["deriveKey"]
      );
      this.sharedSecretDerivedHKDF = await window.crypto.subtle.deriveKey(
        {
          name: "HKDF",
          hash: "SHA-256",
          salt: this.salt,
          info: this.info
        },
        temp,
        {
          name: "AES-CBC",
          length: 256
        },
        true,
        ["encrypt", "decrypt"]
      );
      this.home.consoleHTML = "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b><u>" + this.name + "</u></b> : sharedSecret calculate with " + ((this.name === "Bob")?"Alice":"Bob") + "'s publicKey :";
      this.home.consoleHTML = JSON.stringify(new Buffer(await window.crypto.subtle.exportKey("raw", this.sharedSecret)));
      this.home.consoleHTML = JSON.stringify(new Buffer(await window.crypto.subtle.exportKey("raw", this.sharedSecretDerivedHKDF)));
    }
    await this.sendPublicKey();
  }

  async handleReceiveEncryptedSystemKeyWithSessionKey(encryptedSystemKeyWithSharedKey: ArrayBuffer) {
    if (this.sharedSecretDerivedHKDF !== undefined) {
      const keyArr: ArrayBuffer|undefined = await this.DecryptDatasAES(KeyToUse.SESSION, encryptedSystemKeyWithSharedKey);
      if (keyArr !== undefined) {
        this.systemKey = await window.crypto.subtle.importKey(
          "raw",
          keyArr,
          "AES-CBC",
          true,
          ["encrypt", "decrypt"]
        );
        this.home.consoleHTML = "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b><u>" + this.name + "</u></b> : decrypt systemKey sent by " + ((this.name === "Bob")?"Alice":"Bob");
        if (this.systemKey !== undefined)
        {
          this.home.consoleHTML = JSON.stringify(new Buffer(keyArr));
        }
      }
    }
  }

  
  async handleReceiveEncryptedDatasWithSystemKey (encryptedMsgWithSystemKey: ArrayBuffer) {
    this.home.consoleHTML = "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b><u>" + this.name + "</u></b> : receive text";
    this.home.consoleHTML = "Encrypted text: " + textDec.decode(encryptedMsgWithSystemKey);
    if (this.systemKey !== undefined) {
      const arr: ArrayBuffer|undefined = await this.DecryptDatasAES(KeyToUse.SYSTEM, encryptedMsgWithSystemKey);
      this.home.consoleHTML = "Decrypted text: " + textDec.decode(arr);
    }
  }
  
  sendDataOnPort (type: DataType, arr: ArrayBuffer) {
    if (this.port !== undefined) {
      let arrbuf : ArrayBuffer;
      let dataview4arrbuf : DataView;
      let idx : number = 0;
      arrbuf = new ArrayBuffer(1 + 1 + arr.byteLength + 1);
      dataview4arrbuf = new DataView(arrbuf);
      dataview4arrbuf.setUint8(0, type);
      dataview4arrbuf.setUint8(1, arr.byteLength);
      idx = 2;
      (new Uint8Array(arr)).forEach(n => {
        dataview4arrbuf.setUint8(idx, n);
        idx++;
      });
      dataview4arrbuf.setUint8(idx, 0xAA);
      this.port.write(dataview4arrbuf, undefined);
      this.home.consoleHTML = "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<u><b>" + this.name + "</b></u> : Send to " + ((this.name === "Bob")?"Alice":"Bob");
      const typeText : string = DataType[type];
      this.home.consoleHTML = "[" + type + ", size " + typeText + ", " + typeText + "..., 170]";
      this.home.consoleHTML = JSON.stringify(new Buffer(arrbuf));
    }
  }

  startSerialPort () {
    if (this.home.serialPorts[this.serialPortId] === undefined) {
      return;
    }
    if (this.port !== undefined) {
      if (this.port.path === this.home.serialPorts[this.serialPortId].path) {
        return;
      } else {
        this.port.close();
      }
    }
    if (this.serialPortId === 0) {
      return;
    }
    let path: string = this.home.serialPorts[this.serialPortId].path;
    this.localStorage.store('lastportAPath', path);
    this.port = new SerialPort.SerialPort({
      path: path,
      baudRate: 115200,
    });
    this.home.consoleHTML = "Connect to " + path;
    this.port.on("data", async (d: Buffer) => {
      if (this.serialportBufferReceived !== undefined) {
        let actualLength: number = this.serialportBufferReceived.byteLength;
        this.serialportBufferReceived = this.serialportBufferReceived.transfer(actualLength + d.byteLength);
        let uint8arr : Uint8Array = new Uint8Array(this.serialportBufferReceived);
        uint8arr.set(d, actualLength);
        let dataview4arrbuf : DataView = new DataView(this.serialportBufferReceived);
        if (dataview4arrbuf.byteLength > 2) {
          let type = dataview4arrbuf.getUint8(0);
          let len = dataview4arrbuf.getUint8(1);
          while (this.serialportBufferReceived.byteLength > (2 + len)) {
            let arr: ArrayBuffer = this.serialportBufferReceived.slice(2, 2 + len);
            switch (type) {
              case DataType.PUBLIC_KEY_ECDH:
                arr = this.serialportBufferReceived.slice(1, 2 + len);
                const arrdv: DataView = new DataView(arr);
                arrdv.setUint8(0, 4);
                this.handleReceivePublicKey(arr);
                break;
              case DataType.ENCRYPTED_SYSTEMKEY_WITH_SESSIONKEY:
                this.handleReceiveEncryptedSystemKeyWithSessionKey(arr);
                break;
              case DataType.ENCRYPTED_DATAS_WITH_SYSTEMKEY:
                this.handleReceiveEncryptedDatasWithSystemKey(arr)
                break;
            }
            this.serialportBufferReceived = this.serialportBufferReceived.slice(3 + len);
            dataview4arrbuf = new DataView(this.serialportBufferReceived);
            if (dataview4arrbuf.byteLength < 3) {
              len = 0x10000;
            } else {
              type = dataview4arrbuf.getUint8(0);
              len = dataview4arrbuf.getUint8(1);
            }
          }
        }
      }
    })
  }
  async DecryptDatasAES(keyToUse: KeyToUse, encryptedDatas: ArrayBuffer) : Promise<ArrayBuffer|undefined> {
    let key: CryptoKey | undefined = this.keyToEncrypt(keyToUse);
    if (key !== undefined) {
        let decryptedTestText: ArrayBuffer = await window.crypto.subtle.decrypt({
          name: "AES-CBC",
          iv: this.initialVector
        },
        key,
        encryptedDatas
      );
      return decryptedTestText;
    }
    return undefined;
  }
  
  async EncryptDatasAES(keyToUse: KeyToUse, clearDatas: ArrayBuffer) : Promise<ArrayBuffer|undefined> {
    let key: CryptoKey | undefined = this.keyToEncrypt(keyToUse);
    if (key !== undefined) {
        let encryptedTestText: ArrayBuffer = await window.crypto.subtle.encrypt({
            name: "AES-CBC",
            iv: this.initialVector
          },
          key,
          clearDatas
        );
        return encryptedTestText;
    }
    return undefined;
  }

  zeroPad(data: ArrayBuffer): (ArrayBuffer|undefined) {
    const blockSize = 16 /* KEYS_LEN_BYTES */ ;
    const oldsize : number = data.byteLength;
    const newsize: number = Math.ceil(oldsize / blockSize) * blockSize;
    const padded : ArrayBuffer = data.transfer(newsize);
    const padded_dv: DataView = new DataView(padded);
    for (var i: number = oldsize; i < newsize ;i++) {
      padded_dv.setUint8(i, 0);
    }
    return padded;
  }
  
  resetSerialPort() {
    this.serialportBufferReceived = new ArrayBuffer(0);
  }
  
}

const INITIAL_VECTOR: string = "7cb56057cb391c112e02588c74f4808e";
const KEYS_LEN_BITS: number = 128;
const KEYS_LEN_BYTES: number = KEYS_LEN_BITS / 8;

//const ec = new EC('p' + KEYS_LEN_BITS); // secpXXXr1

enum DataType {
  NONE = 0,
  PUBLIC_KEY_ECDH = 1,
  ENCRYPTED_SYSTEMKEY_WITH_SESSIONKEY,
  ENCRYPTED_DATAS_WITH_SYSTEMKEY,
  PUBLIC_KEY,
}

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
export class HomeComponent implements OnInit, OnDestroy {

  @HostListener("window:beforeunload", ["$event"]) unloadHandler(event: Event) {
      console.log("Processing beforeunload...");
      // Do more processing...
      this.closeSerialPorts();
  }
  
  _console: SafeHtml = "Contenu de la console:<br>Debut<br>";
  set consoleHTML (a: string) {
    //this._console = this.sanitizer.bypassSecurityTrustHtml(a + "<br>");
    this._console += a + "<br>";
    console.log(JSON.stringify(a));
    this.ref.detectChanges();
  }
  get consoleHTML (): SafeHtml {
    return this._console;
  }

  //serialPort: SerialPort.SerialPort;
  serialPorts: Array<PortInfo> = Array<PortInfo>();

  A: KeysAndSerialPortClass;
  B: KeysAndSerialPortClass;
  
  textToSend: string = "Samuel vous envoie un bonjour chez AtralTech!";

  constructor(private ref: ChangeDetectorRef, private sanitizer: DomSanitizer, private localStorage: LocalStorageService) {
    this.A = new KeysAndSerialPortClass("Alice", this, localStorage);
    this.B = new KeysAndSerialPortClass("Bob", this, localStorage);
    this.A.resetSerialPort();
    this.B.resetSerialPort();
    this.generateKeys();
    
    //this.serialPort = window.require('serialport');
  }

  async generateKeys () {
    this.A.systemKey = await window.crypto.subtle.importKey(
      "raw",
      window.crypto.getRandomValues(new Uint8Array(KEYS_LEN_BYTES)),
      "AES-CBC",
      true,
      ["encrypt", "decrypt"]
    );
  }

  ngOnDestroy() {
    this.closeSerialPorts();
  }

  ngOnInit(): void {
    console.log('HomeComponent INIT');
    let portAPath  = this.localStorage.retrieve("lastportAPath");
    let portBPath  = this.localStorage.retrieve("lastportBPath");
    let tmp: PortInfo = {
      path: "Aucun port",
      manufacturer: undefined,
      serialNumber: undefined,
      pnpId: undefined,
      locationId: undefined,
      productId: undefined,
      vendorId: undefined,
    };
    this.serialPorts.push(tmp);
    SerialPort.SerialPort.list().then(ports => {
      console.log(JSON.stringify(ports, null, 4));
      ports.forEach(e => {
        if (e.path.startsWith("COM") || 
        (e.pnpId !== undefined && e.pnpId.search(/FTDI/i) !== -1) || 
        (e.pnpId !== undefined && e.pnpId.search(/TTL/i) !== -1) || 
        (e.pnpId !== undefined && e.pnpId.search(/serial/i) !== -1) 
      ) {
          this.serialPorts.push(e);
          if (e.path === portAPath) {
            this.A.serialPortId = this.serialPorts.length - 1;
          } else if (e.path === portBPath) {
            this.B.serialPortId = this.serialPorts.length - 1;
          }
        }
        
      });
      this.ref.detectChanges();
      //console.log(JSON.stringify(this.serialPorts, null, 4));
    });
  }

  resetSerialPorts() {
    this.A.resetSerialPort();
    this.B.resetSerialPort();
  }
  
  startSerialPorts() {
    this.closeSerialPorts();
    this.startSerialPortListenning();
  }

  
  startSerialPortListenning () {
    this.A.startSerialPort();
    this.B.startSerialPort();
  }


  sendDataSerialPortA () {
    this.startSerialPortListenning();
    this.sendAlicePublicKey();
  }

  closeSerialPorts () {
    this.A.closeSerialPort();
    this.B.closeSerialPort();
  }

  async sendAlicePublicKey () {
    this.consoleHTML = "";
    this.consoleHTML = "";
    this.consoleHTML = "";
    await this.A.sendPublicKey();
  }
  
  async aliceSendEncryptedSystemKey() {
    /*
    https://medium.com/@piyalidas.it/angular-encryption-and-decryption-using-cryptojs-a123505c67af
    */
    const systemKeyArr: ArrayBuffer | undefined = await this.A.systemKeyExport();
    if (systemKeyArr !== undefined) {
      let encryptedSystemKey: ArrayBuffer | undefined = await this.A.EncryptDatasAES(KeyToUse.SESSION, systemKeyArr);

      if (encryptedSystemKey !== undefined) {
        this.consoleHTML = "";
        this.consoleHTML = "";
        this.consoleHTML = "";
        this.consoleHTML = "Clear SystemKey in Uint8Array";
        this.consoleHTML = JSON.stringify(new Buffer(systemKeyArr));
        this.consoleHTML = "Encrypted SystemKey in Uint8Array";
        this.consoleHTML = JSON.stringify(new Buffer(encryptedSystemKey));
        this.A.sendDataOnPort(DataType.ENCRYPTED_SYSTEMKEY_WITH_SESSIONKEY ,encryptedSystemKey);
      }
    }
  }

  async aliceSendEncryptedMsg () {
    this.consoleHTML = "";
    this.consoleHTML = "";
    this.consoleHTML = "";
    this.consoleHTML = "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<u><b>Alice</b></u> : Send the following message to Bob"
    this.consoleHTML = "Clear text: " + this.textToSend;
    const text_ArrayBuffer: ArrayBuffer = textEnc.encode(this.textToSend).buffer as ArrayBuffer;
    const text_ArrayBuffer_Encoded: (ArrayBuffer|undefined) = await this.A.EncryptDatasAES(KeyToUse.SYSTEM, text_ArrayBuffer);
    if (text_ArrayBuffer_Encoded !== undefined) {
      this.consoleHTML = "Encrypted text=: " + textDec.decode(text_ArrayBuffer_Encoded);
      this.A.sendDataOnPort(DataType.ENCRYPTED_DATAS_WITH_SYSTEMKEY, text_ArrayBuffer_Encoded);
    }
  }
}