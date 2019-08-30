import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { NgLimpModule } from 'projects/ng-limp/src/public_api';

import { AppComponent } from './app.component';

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
