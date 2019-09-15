import { Injectable } from '@angular/core';

import { Observable, Subject, combineLatest } from 'rxjs';
import { webSocket } from 'rxjs/webSocket';

import * as rs from 'jsrsasign';

import { callArgs, Res, Doc, Session } from './ng-limp.models';
import { CacheService } from './cache.service';

const JWS = rs.jws.JWS;

@Injectable()
export class ApiService {

	debug: boolean = false;
	fileChunkSize: number = 500 * 1024;
	authHashLevel: 5.0 | 5.6 = 5.6;

	private subject!: Subject<any>;
	private conn: Subject<Res<Doc>> = new Subject();

	private queue: {
		noAuth: Array<{ subject: Array<Subject<any>>; callArgs: callArgs; }>;
		auth: Array<{ subject: Array<Subject<any>>; callArgs: callArgs; }>;
	} = {
		noAuth: new Array(),
		auth: new Array()
	};

	private api: string;
	private anonToken!: string;

	inited: boolean;
	inited$: Subject<boolean> = new Subject();

	authed: boolean = false;
	authed$: Subject<Session> = new Subject();

	session!: Session;

	constructor(private cache: CacheService) {
		this.inited$.subscribe((init) => {
			if (init) {
				if (this.queue.noAuth) {
					this.log('info', 'Found calls in noAuth queue:', this.queue.noAuth);
				}
				for (let call of this.queue.noAuth) {
					this.log('info', 'processing noAuth call: ', call);
					combineLatest(call.subject).subscribe({
						complete: () => {
							// Header
							let oHeader = { alg: 'HS256', typ: 'JWT' };
							// Payload
							let tNow = Math.round((new Date() as any) / 1000);
							let tEnd = Math.round((new Date() as any) / 1000) + 86400;
							let sHeader = JSON.stringify(oHeader);
							let sPayload = JSON.stringify({ ...call.callArgs, iat: tNow, exp: tEnd });
							let sJWT = JWS.sign('HS256', sHeader, sPayload, { utf8: this.anonToken });
							this.log('info', 'sending noAuth queue request as JWT token:', call.callArgs, this.anonToken);
							this.subject.next({ token: sJWT, call_id: call.callArgs.call_id });
						}
					});
				}

				this.queue.noAuth = [];
			}
		});

		this.authed$.subscribe((session) => {
			if (session) {
				if (this.queue.noAuth) {
					this.log('info', 'Found calls in auth queue:', this.queue.auth);
				}
				for (let call of this.queue.auth) {
					this.log('info', 'processing auth call: ', call);
					combineLatest(call.subject).subscribe({
						complete: () => {
							// Header
							let oHeader = { alg: 'HS256', typ: 'JWT' };
							// Payload
							let tNow = Math.round((new Date() as any) / 1000);
							let tEnd = Math.round((new Date() as any) / 1000) + 86400;
							let sHeader = JSON.stringify(oHeader);
							let sPayload = JSON.stringify({ ...call.callArgs, iat: tNow, exp: tEnd });
							let sJWT = JWS.sign('HS256', sHeader, sPayload, { utf8: this.session.token });
							this.log('info', 'sending auth queue request as JWT token:', call.callArgs, this.anonToken);
							this.subject.next({ token: sJWT, call_id: call.callArgs.call_id });
						}
					});
				}

				this.queue.auth = [];
			}
		});
	}

	log(level: 'log' | 'info' | 'warn' | 'error', ...data: any): void {
		if (!this.debug) return;
		console[level](...data);
	}

	init(api: string, anonToken: string): Observable<Res<Doc>> {
		this.log('log', 'Resetting SDK before init');
		this.reset();
		this.api = api;
		this.subject = webSocket(this.api);

		this.log('log', 'Attempting to connect');

		this.subject
		.subscribe((res: Res<Doc>) => {
			this.log('log', 'Received new message:', res);
			this.conn.next(res);
			if (res.args && res.args.code == 'CORE_CONN_READY') {
				this.reset();
				this.anonToken = anonToken;
				this.call('conn/verify', {}).subscribe();
			} else if (res.args && res.args.code == 'CORE_CONN_OK') {
				this.inited = true;
				this.inited$.next(true);
			} else if (res.args && res.args.code == 'CORE_CONN_CLOSED') {
				this.reset();
			} else if (res.args && res.args.session) {
				this.log('log', 'Response has session obj');
				if (res.args.session._id == 'f00000000000000000000012') {
					if (this.authed) {
						this.authed = false;
						this.session = null;
						this.authed$.next(null);
					}
					this.cache.remove('token');
					this.cache.remove('sid');
					this.log('log', 'Session is null');
				} else {
					this.cache.put('sid', res.args.session._id);
					this.cache.put('token', res.args.session.token);
					this.authed = true;
					this.session = res.args.session;
					this.authed$.next(this.session);
					this.log('log', 'Session updated');
				}
			}
		}, (err: Res<Doc>) => {
			this.log('log', 'Received error:', err);
			this.conn.error(err);
			this.reset(true);
		}, () => {
			this.log('log', 'Connection clean-closed');
			this.reset();
		});

		return this.subject;
	}

	close(): Observable<Res<Doc>> {
		let call = this.call('conn/close', {});
		call.subscribe();
		return call;
	}

	reset(forceInited: boolean = false): void {
		try {
			this.authed = false;
			if (this.session) {
				this.session = null;
				this.authed = false;
				this.authed$.next(null);
			}
	
			if (forceInited || this.inited) {
				this.inited = false;
				this.inited$.next(false);
			}
		} catch { }
	}

	call(endpoint: string, callArgs: callArgs, awaitAuth: boolean = false): Observable<Res<Doc>> {

		callArgs.sid = (this.authed) ? callArgs.sid || this.cache.get('sid') || 'f00000000000000000000012' : callArgs.sid || 'f00000000000000000000012';
		callArgs.token = (this.authed) ? callArgs.token || this.cache.get('token') || this.anonToken : callArgs.token || this.anonToken;
		callArgs.query = callArgs.query || [];
		callArgs.doc = callArgs.doc || {};

		callArgs.endpoint = endpoint;
		callArgs.call_id = Math.random().toString(36).substring(7);

		this.log('log', 'callArgs', callArgs);

		let files: {
			[key: string]: FileList;
		} = {};
		let filesSubjects: Array<Subject<any>> = [];

		for (let attr of Object.keys(callArgs.doc)) {
			if (callArgs.doc[attr] instanceof FileList) {
				this.log('log', 'Detected FileList for doc attr: ', attr);
				files[attr] = callArgs.doc[attr];
				callArgs.doc[attr] = [];
				for (let file of (files[attr] as any)) {
					callArgs.doc[attr].push(file);
				}
			}
		}

		for (let attr of Object.keys(files)) {
			this.log('log', 'Attempting to read files from:', files[attr]);
			let fileSubject = new Subject();
			filesSubjects.push(fileSubject);
			let fileUploads = [];
			for (let i of Object.keys(files[attr])) {
				this.log('log', 'Attempting to read file: ', i, files[attr][i])
				let reader = new FileReader();
				let readerObservable = new Observable<any>(
					(observer) => {
						reader.onloadend = (file) => {
							let byteArray = new Uint8Array((reader.result as any));
							let byteArrayIndex: number = 0;
							let chunkIndex: number = 1;
							while (byteArrayIndex < byteArray.length) {
								this.log('log', 'Attempting to send chunk of 500kb from:', byteArrayIndex, chunkIndex);
								let fileUpload = this.call('file/upload', { doc: {
									attr: attr,
									index: i,
									chunk: chunkIndex,
									total: Math.ceil(byteArray.length / this.fileChunkSize),
									file: {
										name: files[attr][i].name,
										size: files[attr][i].size,
										type: files[attr][i].type,
										lastModified: files[attr][i].lastModified,
										content: byteArray.slice(byteArrayIndex, byteArrayIndex + this.fileChunkSize).join(',')
									}
								}}, awaitAuth);
								fileUploads.push(fileUpload);
								
								byteArrayIndex += this.fileChunkSize;
								chunkIndex += 1;
							}
							observer.complete();
							observer.unsubscribe();
							readerObservable.unsubscribe();
						};
					}
				).subscribe({
					complete: () => {
						this.log('log', 'Done parsing file: ', i, files[attr][i]);
						combineLatest(fileUploads).subscribe({
							complete: () => {
								this.log('log', 'Finsied uploading file: ', i, files[attr][i]);
								fileSubject.complete();
							}
						});
					}
				});
				reader.readAsArrayBuffer(files[attr][i]);
			}
		}

		this.log('log', 'Populated filesSubjects:', filesSubjects);

		if (this.inited || callArgs.endpoint == 'conn/verify') {
			combineLatest(filesSubjects).subscribe({
				complete: () => {
					// Header
					let oHeader = { alg: 'HS256', typ: 'JWT' };
					// Payload
					let tNow = Math.round((new Date() as any) / 1000);
					let tEnd = Math.round((new Date() as any) / 1000) + 86400;
					let sHeader = JSON.stringify(oHeader);
					let sPayload = JSON.stringify({ ...callArgs, iat: tNow, exp: tEnd });
					let sJWT = JWS.sign('HS256', sHeader, sPayload, { utf8: callArgs.token });
					this.log('log', 'sending request as JWT token:', callArgs, callArgs.token);
					this.subject.next({ token: sJWT, call_id: callArgs.call_id });
				}
			});
		} else {
			this.log('warn', 'SDK not yet inited. Queuing call: ', callArgs);
			if (awaitAuth) {
				this.log('warn', 'Queuing in auth queue.');
				this.queue.auth.push({
					subject: filesSubjects,
					callArgs: callArgs
				});
			} else {
				this.log('warn', 'Queuing in noAuth queue.');
				this.queue.noAuth.push({
					subject: filesSubjects,
					callArgs: callArgs
				});
			}
		}

		let call = new Observable<Res<Doc>>(
			(observer) => {
				let observable = this.conn
					.subscribe(
						(res: Res<Doc>) => {
							if (res.args && res.args.call_id == callArgs.call_id) {
								this.log('log', 'message received from observer on call_id:', res, callArgs.call_id);
								if (res.status == 200) {
									observer.next(res);
								} else {
									observer.error(res);
								}

								if (!res.args.watch) {
									this.log('log', 'completing the observer with call_id:', res.args.call_id);
									observer.complete();
									observer.unsubscribe();
									observable.unsubscribe();
								} else {
									this.log('log', 'Detected watch with call_id:', res.args.call_id);
								}
							}
						}, (err: Res<Doc>) => {
							if (err.args && err.args.call_id == callArgs.call_id) {
								observer.error(err);
							}
						}, () => {
							observer.complete();
						}
					);
			}
		);
		return call;
	}

	deleteWatch(watch: string | '__all'): Observable<Res<Doc>> {
		let call = this.call('watch/delete', { query: [{ watch: watch }] });
		call.subscribe({
			error: (err) => { this.log('error', 'deleteWatch call err:', err); }
		});
		return call;
	}

	generateAuthHash(authVar: 'username' | 'email' | 'phone', authVal: string, password: string): string {
		let oHeader = { alg: 'HS256', typ: 'JWT' };
		let sHeader = JSON.stringify(oHeader);
		let hashObj = [authVar, authVal, password];
		if (this.authHashLevel == 5.6) {
			hashObj.push(this.anonToken);
		}
		let sPayload = JSON.stringify({ hash: hashObj });
		let sJWT = JWS.sign('HS256', sHeader, sPayload, { utf8: password });
		return sJWT.split('.')[1];
	}

	auth(authVar: 'username' | 'email' | 'phone', authVal: string, password: string): Observable<Res<Doc>> {
		let doc: any = { hash: this.generateAuthHash(authVar, authVal, password) };
		doc[authVar] = authVal;
		let call = this.call('session/auth', {doc: doc});
		call.subscribe({
			error: (err) => { this.log('error', 'auth call err:', err); }
		});
		return call;
	}

	reauth(sid: string = this.cache.get('sid'), token: string = this.cache.get('token')): Observable<Res<Doc>> {
		let oHeader = { alg: 'HS256', typ: 'JWT' };
		let sHeader = JSON.stringify(oHeader);
		let sPayload = JSON.stringify({ token: token });
		let sJWT = JWS.sign('HS256', sHeader, sPayload, { utf8: token });
		let call: Observable<Res<Doc>> = this.call('session/reauth', {
			sid: 'f00000000000000000000012',
			token: this.anonToken,
			query: [
				{ _id: sid || 'f00000000000000000000012', hash: sJWT.split('.')[1] }
			]
		});
		call.subscribe({
			error: (err: Res<Session>) => {
				this.log('error', 'reauth call err:', err);
				this.cache.remove('token');
				this.cache.remove('sid');
				if (this.authed) {
					this.authed = false;
					this.session = null;
					this.authed$.next(null);
				}
			}
		});
		return call;
	}

	signout(): Observable<Res<Doc>> {
		let call = this.call('session/signout', {
			query: [
				{ _id: this.cache.get('sid') }
			]
		});
		call.subscribe({
			error: (err) => { this.log('error', 'signout call err:', err); }
		});
		return call;
	}

	checkAuth(): Observable<Res<Doc>> {
		this.log('log', 'attempting checkAuth');
		if (!this.cache.get('token') || !this.cache.get('sid')) throw new Error('No credentials cached.');
		let call = this.reauth(this.cache.get('sid'), this.cache.get('token'));
		return call;
	}
}
