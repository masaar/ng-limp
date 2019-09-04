import { Injectable } from '@angular/core';

import { Observable, Subject } from 'rxjs';
import { webSocket } from 'rxjs/webSocket';
import { take, retry } from 'rxjs/operators';

import { CookieService } from 'ngx-cookie';
import * as rs from 'jsrsasign';

const JWS = rs.jws.JWS;

export interface QueryStep {
	$search?: string;
	$sort?: {
		[attr: string]: 1 | -1;
	};
	$skip?: number;
	$limit?: number;
	$extn?: false | Array<string>;
	$attrs?: Array<string>;
	$group?: Array<{
		by: string;
		count: number;
	}>;
	[attr: string]: {
		$not: any;
	} | {
		$eq: any;
	} | {
		$gt: number | string;
	} | {
		$gte: number | string;
	} | {
		$lt: number | string;
	} | {
		$lte: number | string;
	} | {
		$bet: [number, number] | [string, string];
	} | {
		$all: Array<any>;
	} | {
		$in: Array<any>;
	} | {
		$attrs: Array<string>;
	} | {
		$skip: false | Array<string>;
	} | Query | string | { [attr: string]: 1 | -1; } | number | false | Array<string>;
}

export interface Query extends Array<QueryStep> {}

export interface callArgs {
	call_id?: string;
	endpoint?: string;
	sid?: string;
	token?: string;
	query?: Query;
	doc?: {
		[attr: string]: any;
	};
}

export interface Res<T> {
	args: {
		call_id: string;
		watch?: string;
		// [DOC] Succeful call attrs
		docs?: Array<T>;
		count?: number;
		total?: number;
		groups?: any;
		session?: Session;
		// [DOC] Failed call attrs
		code?: string;
	}
	msg: string;
	status: number;
}

export interface Doc {
	_id: string;
	[key: string]: any;
}

export interface Session extends Doc {
	user: User;
	host_add: string;
	user_agent: string;
	timestamp: string;
	expiry: string;
	token: string;
}

export interface User extends Doc {
	username: string;
	email: string;
	phone: string;
	name: { [key: string]: string };
	bio: { [key: string]: string };
	address: { [key: string]: string };
	postal_code: string;
	website: string;
	locale: string;
	create_time: string;
	login_time: string;
	groups: Array<string>,
	privileges: { [key: string]: Array<string>; },
	username_hash?: string;
	email_hash?: string;
	phone_hash?: string;
	status: 'active' | 'banned' | 'deleted' | 'disabled_password',
	attrs: {
		[key: string]: any;
	}
}

@Injectable()
export class CacheService {

	constructor(private cookie: CookieService) { }

	get(key: string): string {
		return this.cookie.get(key);
	}

	put(key: string, val: string): void {
		this.cookie.put(key, val);
	}

	remove(key: string): void {
		this.cookie.remove(key);
	}
}

@Injectable()
export class ApiService {
	subject!: Subject<any>;
	skipForceRetry: boolean = false;
	api!: string;
	anonToken!: string;
	fileChunkSize: number = 500 * 1024;
	debug: boolean = false;

	session!: Session;

	inited: boolean = false;
	inited$: Subject<boolean> = new Subject();

	authed: boolean = false;
	authed$: Subject<Session> = new Subject();

	constructor(private cache: CacheService) { }

	debugLog(...payload: any): void {
		if (!this.debug) return;
		console.log(...payload);
	}

	init(api: string, anonToken: string, retryCount: number = 10, forceRetry: boolean = true): Observable<Res<Doc>> {
		this.debugLog('Resetting SDK before init');
		this.reset();
		this.api = api;
		this.subject = webSocket(this.api);

		this.debugLog('Attempting to connect');

		this.subject
		.pipe(retry(retryCount))
		.subscribe((res: Res<Doc>) => {
			this.debugLog('Received new message:', res);
			if (res.args && res.args.code == 'CORE_CONN_READY') {
				this.reset(true);
				this.anonToken = anonToken;
				this.call('conn/verify', {}).subscribe();
			} else if (res.args && res.args.code == 'CORE_CONN_OK') {
				this.inited = true;
				this.inited$.next(true);
			} else if (res.args && res.args.code == 'CORE_CONN_CLOSED') {
				this.reset();
			} else if (res.args && res.args.session) {
				this.debugLog('Response has session obj');
				if (res.args.session._id == 'f00000000000000000000012') {
					if (this.authed) {
						this.authed = false;
						this.session = null;
						this.authed$.next(null);
					}
					this.cache.remove('token');
					this.cache.remove('sid');
					this.debugLog('Session is null');
				} else {
					this.cache.put('sid', res.args.session._id);
					this.cache.put('token', res.args.session.token);
					this.authed = true;
					this.session = res.args.session;
					this.authed$.next(this.session);
					this.debugLog('Session updated');
				}
			}
		}, (err: Res<Doc>) => {
			this.debugLog('Received error:', err);
			this.reset();
		}, () => {
			this.debugLog('Connection clean-closed');
			this.reset();
			if (!this.skipForceRetry && forceRetry) {
				if (retryCount-- < 1) {
					this.debugLog('Skipped re-init connection after clean-close due to out-of-count retryCount.');
				} else {
					this.debugLog('Re-init connection after clean-close due to forceRetry.');
					this.init(api, anonToken, retryCount--, forceRetry);
				}
			}
		});

		this.skipForceRetry = false;

		return this.subject;
	}

	close(): Observable<Res<Doc>> {
		return this.call('conn/close', {});
	}

	reset(skipSubject: boolean = false): void {
		try {
			this.authed = false;
			if (this.session) {
				this.session = null;
				this.authed = false;
				this.authed$.next(null);
			}
	
			if (this.inited) {
				this.inited = false;
				this.inited$.next(false);
			}
	
			if (!skipSubject) {
				this.skipForceRetry = true;

				this.subject.complete();
				this.subject.unsubscribe();
			}
		} catch { }
	}

	call(endpoint: string, callArgs: callArgs): Observable<Res<Doc>> {
		callArgs.sid = (this.authed) ? callArgs.sid || this.cache.get('sid') || 'f00000000000000000000012' : callArgs.sid || 'f00000000000000000000012';
		callArgs.token = (this.authed) ? callArgs.token || this.cache.get('token') || this.anonToken : callArgs.token || this.anonToken;
		callArgs.query = callArgs.query || [];
		callArgs.doc = callArgs.doc || {};

		callArgs.endpoint = endpoint;
		callArgs.call_id = Math.random().toString(36).substring(7);

		this.debugLog('callArgs', callArgs);

		let filesProcess = [];

		for (let attr of Object.keys(callArgs.doc)) {
			if (callArgs.doc[attr] instanceof FileList) {
				let files = callArgs.doc[attr];
				callArgs.doc[attr] = [];
				for (let file of files) {
					callArgs.doc[attr].push(file);
				}
				for (let i of Object.keys(callArgs.doc[attr])) {
					filesProcess.push(`${attr}.${i}`);
					let reader = new FileReader();
					reader.onloadend = (file) => {
						let byteArray = new Uint8Array((reader.result as any));
						let byteArrayIndex: number = 0;
						let chunkIndex: number = 1;
						while (byteArrayIndex < byteArray.length) {
							this.debugLog('attempting to send chunk of 500kb from:', byteArrayIndex, chunkIndex);
							this.call('file/upload', {
								doc: {
									attr: attr,
									index: i,
									chunk: chunkIndex,
									total: Math.ceil(byteArray.length / this.fileChunkSize),
									file: {
										name: callArgs.doc[attr][i].name,
										size: callArgs.doc[attr][i].size,
										type: callArgs.doc[attr][i].type,
										lastModified: callArgs.doc[attr][i].lastModified,
										content: byteArray.slice(byteArrayIndex, byteArrayIndex + this.fileChunkSize).join(',')
									}
								}
							}).pipe(take(1)).subscribe((res) => {
								filesProcess.splice(filesProcess.indexOf(`${attr}.${i}`), 1);
							});
							byteArrayIndex += this.fileChunkSize;
							chunkIndex += 1;
						}
					};
					reader.readAsArrayBuffer(callArgs.doc[attr][i]);
				}
			}
		}
		this.pushCall(callArgs, filesProcess);

		let call = new Observable<Res<Doc>>(
			(observer) => {
				let observable = this.subject
					.subscribe(
						(res: Res<Doc>) => {
							if (res.args && res.args.call_id == callArgs.call_id) {
								this.debugLog('message received from observer on call_id:', res, callArgs.call_id);
								if (res.status == 200) {
									observer.next(res);
								} else {
									observer.error(res);
								}

								if (!res.args.watch) {
									this.debugLog('completing the observer with call_id:', res.args.call_id);
									observer.complete();
									observer.unsubscribe();
									observable.unsubscribe();
								} else {
									this.debugLog('Deteched watch with call_id:', res.args.call_id);
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

	pushCall(callArgs: any, filesProcess: Array<string>): void {
		setTimeout(() => {
			this.debugLog('checking filesProcess...');
			if (filesProcess.length) {
				this.pushCall(callArgs, filesProcess);
			} else {
				// Header
				let oHeader = { alg: 'HS256', typ: 'JWT' };
				// Payload
				let tNow = Math.round((new Date() as any) / 1000);
				let tEnd = Math.round((new Date() as any) / 1000) + 86400;
				let sHeader = JSON.stringify(oHeader);
				let sPayload = JSON.stringify({ ...callArgs, iat: tNow, exp: tEnd });
				let sJWT = JWS.sign('HS256', sHeader, sPayload, { utf8: callArgs.token });
				this.debugLog('sending request as JWT token:', callArgs, callArgs.token);
				this.subject.next({ token: sJWT, call_id: callArgs.call_id });
			}
		}, 100);
	}

	generateAuthHash(authVar: 'username' | 'email' | 'phone', authVal: string, password: string): string {
		let oHeader = { alg: 'HS256', typ: 'JWT' };
		let sHeader = JSON.stringify(oHeader);
		let sPayload = JSON.stringify({ hash: [authVar, authVal, password, this.anonToken] });
		let sJWT = JWS.sign('HS256', sHeader, sPayload, { utf8: password });
		return sJWT.split('.')[1];
	}

	auth(authVar: 'username' | 'email' | 'phone', authVal: string, password: string): Observable<Res<Doc>> {
		let doc: any = { hash: this.generateAuthHash(authVar, authVal, password) };
		doc[authVar] = authVal;
		let call = this.call('session/auth', {doc: doc});
		call.subscribe();
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
		call.subscribe((res: Res<Session>) => {}, (err: Res<Session>) => {
			this.cache.remove('token');
			this.cache.remove('sid');
			if (this.authed) {
				this.authed = false;
				this.session = null;
				this.authed$.next(null);
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
		call.subscribe();
		return call;
	}

	checkAuth(): Observable<Res<Doc>> {
		this.debugLog('attempting checkAuth');
		if (!this.cache.get('token') || !this.cache.get('sid')) throw new Error('No credentials cached.');
		let call = this.reauth(this.cache.get('sid'), this.cache.get('token'));
		return call;
	}
}
