import { Injectable } from '@angular/core';

import { CookieService } from 'ngx-cookie';

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