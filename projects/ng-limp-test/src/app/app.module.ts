import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppComponent } from './app.component';
import { NgLimpModule } from 'ng-limp';
import { CookieModule } from 'ngx-cookie';

@NgModule({
	declarations: [
		AppComponent
	],
	imports: [
		BrowserModule,
		// CookieModule.forRoot(),
		NgLimpModule.forRoot()
	],
	providers: [],
	bootstrap: [AppComponent]
})
export class AppModule { }
