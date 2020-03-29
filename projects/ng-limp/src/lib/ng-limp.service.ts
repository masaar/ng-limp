import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, Subject, combineLatest, interval, Subscription } from 'rxjs';
import { webSocket } from 'rxjs/webSocket';

import * as rs from 'jsrsasign';

import { SDKConfig, callArgs, Res, Doc, Session, Query } from './ng-limp.models';
import { CacheService } from './cache.service';

const JWS = rs.jws.JWS;

@Injectable()
export class ApiService {

	private config: SDKConfig = {
		api: null,
		anonToken: null,
		authAttrs: [],
		appId: null,
		debug: false,
		fileChunkSize: 500 * 1024,
		authHashLevel: '6.1'
	}


	private subject!: Subject<any>;
	private conn: Subject<Res<Doc>> = new Subject();

	private heartbeat: Observable<number> = interval(30000);
	private heartbeat$: Subscription;

	private queue: {
		noAuth: Array<{ subject: Array<Observable<Res<Doc>>>; callArgs: callArgs; }>;
		auth: Array<{ subject: Array<Observable<Res<Doc>>>; callArgs: callArgs; }>;
	} = {
			noAuth: new Array(),
			auth: new Array()
		};

	inited: boolean;
	inited$: Subject<boolean> = new Subject();

	authed: boolean = false;
	authed$: Subject<Session> = new Subject();

	session!: Session;

	constructor(private cache: CacheService, private http: HttpClient) {
		this.inited$.subscribe((init) => {
			if (init) {
				this.heartbeat$ = this.heartbeat.subscribe((i) => {
					this.call({
						endpoint: 'heart/beat'
					}).subscribe({
						error: (err) => { }
					});
				});
				if (this.queue.noAuth) {
					this.log('info', 'Found calls in noAuth queue:', this.queue.noAuth);
				}
				for (let call of this.queue.noAuth) {
					this.log('info', 'processing noAuth call:', call);
					combineLatest(call.subject).subscribe({
						complete: () => {
							// Header
							let oHeader = { alg: 'HS256', typ: 'JWT' };
							// Payload
							let tNow = Math.round((new Date() as any) / 1000);
							let tEnd = Math.round((new Date() as any) / 1000) + 86400;
							let sHeader = JSON.stringify(oHeader);
							let sPayload = JSON.stringify({ ...call.callArgs, iat: tNow, exp: tEnd });
							let sJWT = JWS.sign('HS256', sHeader, sPayload, { utf8: this.config.anonToken });
							this.log('info', 'sending noAuth queue request as JWT token:', call.callArgs, this.config.anonToken);
							this.subject.next({ token: sJWT, call_id: call.callArgs.call_id });
						}
					});
				}

				this.queue.noAuth = [];
			} else {
				this.heartbeat$.unsubscribe();
			}
		});

		this.authed$.subscribe((session) => {
			if (session) {
				if (this.queue.noAuth) {
					this.log('info', 'Found calls in auth queue:', this.queue.auth);
				}
				for (let call of this.queue.auth) {
					this.log('info', 'processing auth call:', call);
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
							this.log('info', 'sending auth queue request as JWT token:', call.callArgs, this.config.anonToken);
							this.subject.next({ token: sJWT, call_id: call.callArgs.call_id });
						}
					});
				}

				this.queue.auth = [];
			}
		});
	}

	log(level: 'log' | 'info' | 'warn' | 'error', ...data: Array<any>): void {
		if (!this.config.debug) return;
		console[level](...data);
	}

	init(config: SDKConfig): Observable<Res<Doc>> {
		Object.assign(this.config, config);
		if (this.config.authAttrs.length == 0) {
			throw new Error('SDK authAttrs not set')
		}
		this.log('log', 'Resetting SDK before init');
		this.reset();
		this.subject = webSocket(this.config.api);

		this.log('log', 'Attempting to connect');

		this.subject
			.subscribe((res: Res<Doc>) => {
				this.log('log', 'Received new message:', res);
				this.conn.next(res);
				if (res.args && res.args.code == 'CORE_CONN_READY') {
					this.reset();
					this.config.anonToken = config.anonToken;
					this.call({
						endpoint: 'conn/verify',
						doc: { 'app': config.appId }
					}).subscribe();
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
		let call = this.call({
			endpoint: 'conn/close'
		});
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

	call(callArgs: callArgs): Observable<Res<Doc>> {

		callArgs.sid = (this.authed) ? callArgs.sid || this.cache.get('sid') || 'f00000000000000000000012' : callArgs.sid || 'f00000000000000000000012';
		callArgs.token = (this.authed) ? callArgs.token || this.cache.get('token') || this.config.anonToken : callArgs.token || this.config.anonToken;
		callArgs.query = callArgs.query || [];
		callArgs.doc = callArgs.doc || {};
		callArgs.awaitAuth = callArgs.awaitAuth || false;
		callArgs.call_id = Math.random().toString(36).substring(7);

		this.log('log', 'callArgs', callArgs);

		let files: {
			[key: string]: FileList;
		} = {};
		let filesUploads: Array<Observable<Res<Doc>>> = [];

		for (let attr of Object.keys(callArgs.doc)) {
			if (callArgs.doc[attr] instanceof FileList) {
				this.log('log', 'Detected FileList for doc attr:', attr);
				files[attr] = callArgs.doc[attr];
				callArgs.doc[attr] = [];
				this.log('log', 'Attempting to read files from:', files[attr]);
				for (let i of Object.keys(files[attr])) {
					callArgs.doc[attr].push(files[attr][i].name);
					this.log('log', 'Attempting to read file:', i, files[attr][i])
					let fileUpload: Observable<Res<Doc>> = new Observable(
						(observer) => {
							let form: FormData = new FormData();
							form.append('__module', callArgs.endpoint.split('/')[0]);
							form.append('__attr', attr);
							form.append('lastModified', files[attr][i].lastModified);
							form.append('file', files[attr][i], files[attr][i].name);
							let observable = this.http.post(
								`${this.config.api.replace('ws', 'http').replace('/ws', '')}/file/create`,
								form,
								{
									headers: {
										'X-Auth-Bearer': callArgs.sid,
										'X-Auth-Token': callArgs.token,
										'X-Auth-App': this.config.appId
									}
								}
							).subscribe({
								next: (res: Res<Doc>) => {
									callArgs.doc[attr][i] = { __file: res.args.docs[0]._id };
									observer.complete();
									observer.unsubscribe();
									observable.unsubscribe();
								},
								error: (err: Res<Doc>) => {
									observer.error(err);
								},
								complete: () => {
									observer.complete();
								}
							});
						}
					);
					filesUploads.push(fileUpload);
				}
			}
		}

		this.log('log', 'Populated filesObservables:', filesUploads);

		if ((this.inited && callArgs.awaitAuth && this.authed) || (this.inited && !callArgs.awaitAuth) || callArgs.endpoint == 'conn/verify') {
			combineLatest(filesUploads).subscribe({
				error: (err) => {
					this.log('error', 'Received error on filesSubjects:', err);
				},
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
			this.log('warn', 'SDK not yet inited. Queuing call:', callArgs);
			if (callArgs.awaitAuth) {
				this.log('warn', 'Queuing in auth queue.');
				this.queue.auth.push({
					subject: filesUploads,
					callArgs: callArgs
				});
			} else {
				this.log('warn', 'Queuing in noAuth queue.');
				this.queue.noAuth.push({
					subject: filesUploads,
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
		let call = this.call({
			endpoint: 'watch/delete',
			query: [{ watch: watch }]
		});
		call.subscribe({
			error: (err) => { this.log('error', 'deleteWatch call err:', err); }
		});
		return call;
	}

	generateAuthHash(authVar: string, authVal: string, password: string): string {
		if (this.config.authAttrs.indexOf(authVar) == -1 && authVar != 'token') {
			throw new Error(`Unkown authVar '${authVar}'. Accepted authAttrs: '${this.config.authAttrs.join(', ')}, token'`)
		}
		if (this.config.authHashLevel != '6.1') {
			let oHeader = { alg: 'HS256', typ: 'JWT' };
			let sHeader = JSON.stringify(oHeader);
			let hashObj = [authVar, authVal, password];
			if (this.config.authHashLevel == '5.6') {
				hashObj.push(this.config.anonToken);
			}
			let sPayload = JSON.stringify({ hash: hashObj });
			let sJWT = JWS.sign('HS256', sHeader, sPayload, { utf8: password });
			return sJWT.split('.')[1];
		} else {
			if (!password.match(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.{8,})/)) {
				throw new Error('Password should be 8 chars, contains one lower-case char, one upper-case char, one number at least.');
			}
			return `${authVar}${authVal}${password}${this.config.anonToken}`;
		}
	}

	auth(authVar: string, authVal: string, password: string, groups?: Array<string>): Observable<Res<Doc>> {
		if (this.authed) throw new Error('User already authed.');
		if (this.config.authAttrs.indexOf(authVar) == -1) {
			throw new Error(`Unkown authVar '${authVar}'. Accepted authAttrs: '${this.config.authAttrs.join(', ')}'`)
		}
		let doc: any = { hash: this.generateAuthHash(authVar, authVal, password) };
		doc[authVar] = authVal;
		if (groups && groups.length) {
			doc.groups = groups;
		}
		let call = this.call({
			endpoint: 'session/auth',
			doc: doc
		});
		call.subscribe({
			error: (err) => { this.log('error', 'auth call err:', err); }
		});
		return call;
	}

	reauth(sid: string = this.cache.get('sid'), token: string = this.cache.get('token'), groups?: Array<string>): Observable<Res<Doc>> {
		let query: Query = [
			{ _id: sid || 'f00000000000000000000012', token: token }
		];
		if (groups && groups.length) {
			query.push({ groups: groups });
		}
		let call: Observable<Res<Doc>> = this.call({
			endpoint: 'session/reauth',
			sid: 'f00000000000000000000012',
			token: this.config.anonToken,
			query: query
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
		if (!this.authed) throw new Error('User not authed.');
		let call = this.call({
			endpoint: 'session/signout',
			query: [
				{ _id: this.cache.get('sid') }
			]
		});
		call.subscribe({
			error: (err) => { this.log('error', 'signout call err:', err); }
		});
		return call;
	}

	checkAuth(groups?: Array<string>): Observable<Res<Doc>> {
		this.log('log', 'attempting checkAuth');
		if (!this.cache.get('token') || !this.cache.get('sid')) throw new Error('No credentials cached.');
		let call = this.reauth(this.cache.get('sid'), this.cache.get('token'), groups);
		return call;
	}
}
